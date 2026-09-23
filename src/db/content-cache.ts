import type { InferSelectModel } from "drizzle-orm";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool, PoolClient } from "pg";
import { contentTypes, pages, settings, templates } from "./schema.js";

// `$client` is optional in this type (even though the ambient `./client.js` module
// always provides one for a real drizzle(pool) instance) so callers that only have the plain
// `NodePgDatabase` type from getDb()'s public-facing callers (site.ts, fonts.ts, templates.ts)
// don't need to thread a stricter type through their own signatures — the functions below already
// guard every `$client` use for exactly this reason.
type Db = NodePgDatabase<Record<string, unknown>> & { $client?: Pool };
type PageRow = InferSelectModel<typeof pages>;
type TemplateRow = InferSelectModel<typeof templates>;
type ContentTypeRow = InferSelectModel<typeof contentTypes>;

export type BreadcrumbEntry = { title: string; path: string };
type PageWithBreadcrumbs = { page: PageRow; breadcrumbs: BreadcrumbEntry[] };

// Public page renders read site settings, fonts, the default-template mapping, and the whole
// page tree on every single request, but none of it changes except through the admin write paths
// (settings/update, pages/update & toggle & bulk & drafts/publish, templates/update & toggle &
// bulk, content/* — content items live in the `pages` table too). So it's cached in-process for
// the life of the server rather than on a TTL, and those handlers call the invalidate* functions
// below after writing. A `*Loading` promise alongside each cache guards against a thundering herd
// of concurrent requests all missing the cache at once and firing the same query repeatedly.
//
// Under PM2 cluster mode (or any multi-process deployment on one host) each worker holds its own
// copy of these caches, so a write handled by worker A must also tell workers B..N to drop theirs
// — a bare in-process invalidate() only clears A's copy. Postgres LISTEN/NOTIFY does that
// broadcast without adding new infrastructure (every worker already has the same Postgres): each
// worker LISTENs on one channel via a dedicated connection, and invalidate*() both clears its own
// cache immediately (so the writer's own worker doesn't wait on the round trip) and NOTIFYs the
// channel so the others do the same.
const CACHE_CHANNEL = "purplepanda_cache_invalidate";
type CacheKind = "settings" | "templates" | "pages" | "contentTypes";

let settingsCache: Map<string, unknown> | null = null;
let settingsLoading: Promise<Map<string, unknown>> | null = null;

let templatesCache: Map<string, TemplateRow> | null = null;
let templatesLoading: Promise<Map<string, TemplateRow>> | null = null;

let pageTreeCache: Map<string, PageWithBreadcrumbs> | null = null;
let pageTreeLoading: Promise<Map<string, PageWithBreadcrumbs>> | null = null;

let contentTypesCache: ContentTypeRow[] | null = null;
let contentTypesLoading: Promise<ContentTypeRow[]> | null = null;

const contentTypePageCache = new Map<string, PageRow | undefined>();
const contentTypePageLoading = new Map<string, Promise<PageRow | undefined>>();

function clearSettingsCacheLocal(): void {
  settingsCache = null;
  settingsLoading = null;
}

function clearTemplatesCacheLocal(): void {
  templatesCache = null;
  templatesLoading = null;
}

function clearPagesCacheLocal(): void {
  pageTreeCache = null;
  pageTreeLoading = null;
  contentTypePageCache.clear();
  contentTypePageLoading.clear();
}

function clearContentTypesCacheLocal(): void {
  contentTypesCache = null;
  contentTypesLoading = null;
}

let listenerClient: PoolClient | null = null;
let listenerConnecting = false;

// Idempotent and cheap to call before every cache read — only actually connects once per worker.
// A dropped LISTEN connection (network blip, Postgres restart) would otherwise leave a worker
// permanently deaf to the others' invalidations, so it reconnects on error instead of giving up.
//
// `db.$client` is only guaranteed to be a real `pg.Pool` when the host app's dbModule wraps one
// (as documented) — a test double or a differently-shaped client degrades to local-only
// invalidation rather than throwing, since a single process still behaves correctly without it.
function ensureListening(db: Db): void {
  if (listenerClient || listenerConnecting || typeof db.$client?.connect !== "function") return;
  listenerConnecting = true;

  db.$client
    .connect()
    .then((client) => {
      client.on("notification", (msg) => {
        if (msg.channel !== CACHE_CHANNEL) return;
        const kind = msg.payload as CacheKind | undefined;
        if (kind === "settings") clearSettingsCacheLocal();
        else if (kind === "templates") clearTemplatesCacheLocal();
        else if (kind === "pages") clearPagesCacheLocal();
        else if (kind === "contentTypes") clearContentTypesCacheLocal();
      });
      client.on("error", (err) => {
        console.error("[purplepanda] cache invalidation listener connection error, reconnecting", err);
        listenerClient = null;
        ensureListening(db);
      });
      return client.query(`LISTEN ${CACHE_CHANNEL}`).then(() => {
        listenerClient = client;
      });
    })
    .catch((err) => {
      // Retried the next time a cache read calls ensureListening(); until then this worker just
      // won't hear invalidations from the others (its own writes still clear its local cache).
      console.error("[purplepanda] failed to start cache invalidation listener", err);
    })
    .finally(() => {
      listenerConnecting = false;
    });
}

function broadcastInvalidation(db: Db, kind: CacheKind): void {
  if (typeof db.$client?.query !== "function") return;
  db.$client.query("SELECT pg_notify($1, $2)", [CACHE_CHANNEL, kind]).catch((err) => {
    console.error(`[purplepanda] failed to broadcast ${kind} cache invalidation`, err);
  });
}

export function invalidateSettingsCache(db: Db): void {
  clearSettingsCacheLocal();
  broadcastInvalidation(db, "settings");
}

export function invalidateTemplatesCache(db: Db): void {
  clearTemplatesCacheLocal();
  broadcastInvalidation(db, "templates");
}

export function invalidatePagesCache(db: Db): void {
  clearPagesCacheLocal();
  broadcastInvalidation(db, "pages");
}

export function invalidateContentTypesCache(db: Db): void {
  clearContentTypesCacheLocal();
  broadcastInvalidation(db, "contentTypes");
}

// Every admin page, every public content-type route and the sitemap needs the content type list,
// and it only changes through /admin/settings — so it's cached exactly like the settings and
// templates above, invalidated by the same LISTEN/NOTIFY broadcast.
export async function getContentTypeRows(db: Db): Promise<ContentTypeRow[]> {
  ensureListening(db);
  if (contentTypesCache) return contentTypesCache;
  if (!contentTypesLoading) {
    contentTypesLoading = db
      .select()
      .from(contentTypes)
      .where(eq(contentTypes.state, 1))
      .orderBy(contentTypes.title)
      .then((rows) => {
        contentTypesCache = rows;
        return rows;
      });
  }
  return contentTypesLoading;
}

async function loadSettingsMap(db: Db): Promise<Map<string, unknown>> {
  ensureListening(db);
  if (settingsCache) return settingsCache;
  if (!settingsLoading) {
    settingsLoading = db.select().from(settings).then((rows) => {
      const map = new Map(rows.map((row) => [row.key, row.value]));
      settingsCache = map;
      return map;
    });
  }
  return settingsLoading;
}

export async function getSetting(db: Db, key: string): Promise<unknown> {
  const map = await loadSettingsMap(db);
  return map.get(key);
}

async function loadTemplatesMap(db: Db): Promise<Map<string, TemplateRow>> {
  ensureListening(db);
  if (templatesCache) return templatesCache;
  if (!templatesLoading) {
    templatesLoading = db.select().from(templates).then((rows) => {
      const map = new Map(rows.map((row) => [row.id, row]));
      templatesCache = map;
      return map;
    });
  }
  return templatesLoading;
}

export async function getTemplateById(db: Db, id: string): Promise<TemplateRow | undefined> {
  const map = await loadTemplatesMap(db);
  return map.get(id);
}

// Mirrors the settings->templates join previously used to resolve the site-wide/content-type
// default template: a settings row's value is a template id, resolved against the cached
// templates map. Matches that query's behavior of not filtering on templates.state.
export async function getTemplateForSettingsKey(db: Db, key: string): Promise<TemplateRow | undefined> {
  const [settingsMap, templatesMap] = await Promise.all([loadSettingsMap(db), loadTemplatesMap(db)]);
  const value = settingsMap.get(key);
  return typeof value === "string" ? templatesMap.get(value) : undefined;
}

// Walks a page's parentPage chain to build its breadcrumb trail, using each ancestor's own title
// prop (falling back to its alias) rather than the raw slug segment.
function buildBreadcrumbs(
  page: PageRow,
  pageById: Map<string, PageRow>,
  visited = new Set<string>(),
): BreadcrumbEntry[] {
  if (visited.has(page.id)) return [];
  const content = page.content as any;
  const alias: string = content?.root?.props?.alias ?? "";
  const title: string = content?.root?.props?.title || alias;
  const parentId: string = content?.root?.props?.parentPage ?? "";
  const parent = parentId ? pageById.get(parentId) : undefined;
  const ancestors = parent ? buildBreadcrumbs(parent, pageById, new Set([...visited, page.id])) : [];
  const parentPath = ancestors[ancestors.length - 1]?.path ?? "";
  return [...ancestors, { title, path: parentPath ? `${parentPath}/${alias}` : alias }];
}

function buildPagePath(page: PageRow, pageById: Map<string, PageRow>, visited = new Set<string>()): string {
  if (visited.has(page.id)) return "";
  const content = page.content as any;
  const alias: string = content?.root?.props?.alias ?? "";
  const parentId: string = content?.root?.props?.parentPage ?? "";
  if (parentId && pageById.has(parentId)) {
    const parentPath = buildPagePath(pageById.get(parentId)!, pageById, new Set([...visited, page.id]));
    return parentPath ? `${parentPath}/${alias}` : alias;
  }
  return alias;
}

async function loadPageTree(db: Db): Promise<Map<string, PageWithBreadcrumbs>> {
  ensureListening(db);
  if (pageTreeCache) return pageTreeCache;
  if (!pageTreeLoading) {
    pageTreeLoading = db
      .select()
      .from(pages)
      .where(and(eq(pages.state, 1), isNull(pages.contentType)))
      .then((allPages) => {
        const pageById = new Map(allPages.map((p) => [p.id, p]));
        const map = new Map<string, PageWithBreadcrumbs>();
        for (const page of allPages) {
          map.set(buildPagePath(page, pageById), { page, breadcrumbs: buildBreadcrumbs(page, pageById) });
        }
        pageTreeCache = map;
        return map;
      });
  }
  return pageTreeLoading;
}

export async function getPlainPageForPath(db: Db, path: string): Promise<PageWithBreadcrumbs | undefined> {
  const tree = await loadPageTree(db);
  return tree.get(path);
}

export async function getContentTypePage(db: Db, contentTypeId: string, alias: string): Promise<PageRow | undefined> {
  ensureListening(db);
  const key = `${contentTypeId}:${alias}`;
  if (contentTypePageCache.has(key)) return contentTypePageCache.get(key);
  let loading = contentTypePageLoading.get(key);
  if (!loading) {
    loading = db
      .select()
      .from(pages)
      .where(and(
        eq(pages.state, 1),
        eq(pages.contentType, contentTypeId),
        sql`(${pages.content}->'root'->'props'->>'alias') = ${alias}`,
      ))
      .limit(1)
      .then((rows) => {
        const result = rows[0];
        contentTypePageCache.set(key, result);
        contentTypePageLoading.delete(key);
        return result;
      });
    contentTypePageLoading.set(key, loading);
  }
  return loading;
}
