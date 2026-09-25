import type { InferSelectModel } from "drizzle-orm";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool, PoolClient } from "pg";
import { requireTenant } from "../tenant/context.js";
import { contentTypes, pages, settings, templates, tenantDomains, tenants } from "./schema.js";

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
// All of that is per tenant: each tenant gets its own set of caches, keyed by the tenant in the
// request's context (tenant/context.ts), which is also the tenant row-level security scopes the
// loading queries to — so a cache is only ever filled with, and read back for, its own tenant.
// Invalidating clears just the current tenant's set.
//
// Under PM2 cluster mode (or any multi-process deployment on one host) each worker holds its own
// copy of these caches, so a write handled by worker A must also tell workers B..N to drop theirs
// — a bare in-process invalidate() only clears A's copy. Postgres LISTEN/NOTIFY does that
// broadcast without adding new infrastructure (every worker already has the same Postgres): each
// worker LISTENs on one channel via a dedicated connection, and invalidate*() both clears its own
// cache immediately (so the writer's own worker doesn't wait on the round trip) and NOTIFYs the
// channel so the others do the same. The payload is `<kind>:<tenantId>`, or just `tenants` for the
// domain map below, which isn't per tenant.
const CACHE_CHANNEL = "purplepanda_cache_invalidate";
type TenantCacheKind = "settings" | "templates" | "pages" | "contentTypes";
const TENANT_CACHE_KINDS: readonly string[] = ["settings", "templates", "pages", "contentTypes"] satisfies TenantCacheKind[];

interface TenantCaches {
  settings: Map<string, unknown> | null;
  settingsLoading: Promise<Map<string, unknown>> | null;
  templates: Map<string, TemplateRow> | null;
  templatesLoading: Promise<Map<string, TemplateRow>> | null;
  pageTree: Map<string, PageWithBreadcrumbs> | null;
  pageTreeLoading: Promise<Map<string, PageWithBreadcrumbs>> | null;
  contentTypes: ContentTypeRow[] | null;
  contentTypesLoading: Promise<ContentTypeRow[]> | null;
  contentTypePage: Map<string, PageRow | undefined>;
  contentTypePageLoading: Map<string, Promise<PageRow | undefined>>;
}

const cachesByTenant = new Map<string, TenantCaches>();

function cachesFor(tenantId: string): TenantCaches {
  let caches = cachesByTenant.get(tenantId);
  if (!caches) {
    caches = {
      settings: null,
      settingsLoading: null,
      templates: null,
      templatesLoading: null,
      pageTree: null,
      pageTreeLoading: null,
      contentTypes: null,
      contentTypesLoading: null,
      contentTypePage: new Map(),
      contentTypePageLoading: new Map(),
    };
    cachesByTenant.set(tenantId, caches);
  }
  return caches;
}

function currentCaches(): TenantCaches {
  return cachesFor(requireTenant().id);
}

function clearTenantCacheLocal(kind: TenantCacheKind, tenantId: string): void {
  const caches = cachesByTenant.get(tenantId);
  if (!caches) return;
  if (kind === "settings") {
    caches.settings = null;
    caches.settingsLoading = null;
  } else if (kind === "templates") {
    caches.templates = null;
    caches.templatesLoading = null;
  } else if (kind === "pages") {
    caches.pageTree = null;
    caches.pageTreeLoading = null;
    caches.contentTypePage.clear();
    caches.contentTypePageLoading.clear();
  } else if (kind === "contentTypes") {
    caches.contentTypes = null;
    caches.contentTypesLoading = null;
  }
}

// Every enabled tenant's domains, for the middleware to resolve each request's tenant from its
// hostname before any tenant is in context (tenant/index.ts). Global rather than per tenant, and
// changed only through /dashboard/admin/sites.
export interface TenantDomainEntry {
  tenantId: string;
  tenantName: string;
  tenantState: number;
}

export interface TenantDomainMap {
  byDomain: Map<string, TenantDomainEntry>;
  // Each tenant's hostnames, sorted.
  domainsByTenant: Map<string, string[]>;
  // The hostname each tenant's others redirect to, for tenants that have marked one.
  primaryByTenant: Map<string, string>;
  // The root domain and the tenant owning it, if one is marked.
  rootDomain: string | null;
  rootTenantId: string | null;
}

let tenantDomainCache: TenantDomainMap | null = null;
let tenantDomainLoading: Promise<TenantDomainMap> | null = null;

function clearTenantDomainCacheLocal(): void {
  tenantDomainCache = null;
  tenantDomainLoading = null;
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
        if (msg.channel !== CACHE_CHANNEL || !msg.payload) return;
        if (msg.payload === "tenants") {
          clearTenantDomainCacheLocal();
          return;
        }
        const [kind, tenantId] = msg.payload.split(":");
        if (kind && tenantId && TENANT_CACHE_KINDS.includes(kind)) {
          clearTenantCacheLocal(kind as TenantCacheKind, tenantId);
        }
      });
      client.on("error", (err) => {
        console.error("[purplepanda] cache invalidation listener connection error, reconnecting", err);
        // Hand the broken connection back so the pool discards it, rather than leaking its slot.
        client.release(err);
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

function broadcastInvalidation(db: Db, payload: string): void {
  if (typeof db.$client?.query !== "function") return;
  db.$client.query("SELECT pg_notify($1, $2)", [CACHE_CHANNEL, payload]).catch((err) => {
    console.error(`[purplepanda] failed to broadcast ${payload} cache invalidation`, err);
  });
}

function invalidateTenantCache(db: Db, kind: TenantCacheKind): void {
  const tenantId = requireTenant().id;
  clearTenantCacheLocal(kind, tenantId);
  broadcastInvalidation(db, `${kind}:${tenantId}`);
}

export function invalidateSettingsCache(db: Db): void {
  invalidateTenantCache(db, "settings");
}

export function invalidateTemplatesCache(db: Db): void {
  invalidateTenantCache(db, "templates");
}

export function invalidatePagesCache(db: Db): void {
  invalidateTenantCache(db, "pages");
}

export function invalidateContentTypesCache(db: Db): void {
  invalidateTenantCache(db, "contentTypes");
}

export function invalidateTenantDomainCache(db: Db): void {
  clearTenantDomainCacheLocal();
  broadcastInvalidation(db, "tenants");
}

export async function getTenantDomainMap(db: Db): Promise<TenantDomainMap> {
  ensureListening(db);
  if (tenantDomainCache) return tenantDomainCache;
  if (!tenantDomainLoading) {
    tenantDomainLoading = db
      .select({
        domain: tenantDomains.domain,
        isRoot: tenantDomains.isRoot,
        isPrimary: tenantDomains.isPrimary,
        tenantId: tenants.id,
        tenantName: tenants.name,
        tenantState: tenants.state,
      })
      .from(tenantDomains)
      .innerJoin(tenants, eq(tenantDomains.tenantId, tenants.id))
      .then((rows) => {
        const map: TenantDomainMap = {
          byDomain: new Map(),
          domainsByTenant: new Map(),
          primaryByTenant: new Map(),
          rootDomain: null,
          rootTenantId: null,
        };
        for (const row of rows) {
          map.byDomain.set(row.domain, {
            tenantId: row.tenantId,
            tenantName: row.tenantName,
            tenantState: row.tenantState,
          });
          if (row.isRoot) {
            map.rootTenantId = row.tenantId;
            map.rootDomain = row.domain;
          }
          if (row.isPrimary) map.primaryByTenant.set(row.tenantId, row.domain);
          const domains = map.domainsByTenant.get(row.tenantId) ?? [];
          domains.push(row.domain);
          map.domainsByTenant.set(row.tenantId, domains);
        }
        for (const domains of map.domainsByTenant.values()) domains.sort();
        tenantDomainCache = map;
        return map;
      })
      .catch((err) => {
        // Unlike the tenant caches, a failed load here would otherwise wedge every request on the
        // same rejected promise until an invalidation happened to clear it.
        tenantDomainLoading = null;
        throw err;
      });
  }
  return tenantDomainLoading;
}

// Every admin page, every public content-type route and the sitemap needs the content type list,
// and it only changes through /admin/settings — so it's cached exactly like the settings and
// templates above, invalidated by the same LISTEN/NOTIFY broadcast.
export async function getContentTypeRows(db: Db): Promise<ContentTypeRow[]> {
  ensureListening(db);
  const caches = currentCaches();
  if (caches.contentTypes) return caches.contentTypes;
  if (!caches.contentTypesLoading) {
    caches.contentTypesLoading = db
      .select()
      .from(contentTypes)
      .where(eq(contentTypes.state, 1))
      .orderBy(contentTypes.title)
      .then((rows) => {
        caches.contentTypes = rows;
        return rows;
      });
  }
  return caches.contentTypesLoading;
}

async function loadSettingsMap(db: Db): Promise<Map<string, unknown>> {
  ensureListening(db);
  const caches = currentCaches();
  if (caches.settings) return caches.settings;
  if (!caches.settingsLoading) {
    caches.settingsLoading = db.select().from(settings).then((rows) => {
      const map = new Map(rows.map((row) => [row.key, row.value]));
      caches.settings = map;
      return map;
    });
  }
  return caches.settingsLoading;
}

export async function getSetting(db: Db, key: string): Promise<unknown> {
  const map = await loadSettingsMap(db);
  return map.get(key);
}

async function loadTemplatesMap(db: Db): Promise<Map<string, TemplateRow>> {
  ensureListening(db);
  const caches = currentCaches();
  if (caches.templates) return caches.templates;
  if (!caches.templatesLoading) {
    caches.templatesLoading = db.select().from(templates).then((rows) => {
      const map = new Map(rows.map((row) => [row.id, row]));
      caches.templates = map;
      return map;
    });
  }
  return caches.templatesLoading;
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
  const caches = currentCaches();
  if (caches.pageTree) return caches.pageTree;
  if (!caches.pageTreeLoading) {
    caches.pageTreeLoading = db
      .select()
      .from(pages)
      .where(and(eq(pages.state, 1), isNull(pages.contentType)))
      .then((allPages) => {
        const pageById = new Map(allPages.map((p) => [p.id, p]));
        const map = new Map<string, PageWithBreadcrumbs>();
        for (const page of allPages) {
          map.set(buildPagePath(page, pageById), { page, breadcrumbs: buildBreadcrumbs(page, pageById) });
        }
        caches.pageTree = map;
        return map;
      });
  }
  return caches.pageTreeLoading;
}

export async function getPlainPageForPath(db: Db, path: string): Promise<PageWithBreadcrumbs | undefined> {
  const tree = await loadPageTree(db);
  return tree.get(path);
}

export async function getContentTypePage(db: Db, contentTypeId: string, alias: string): Promise<PageRow | undefined> {
  ensureListening(db);
  const caches = currentCaches();
  const key = `${contentTypeId}:${alias}`;
  if (caches.contentTypePage.has(key)) return caches.contentTypePage.get(key);
  let loading = caches.contentTypePageLoading.get(key);
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
        caches.contentTypePage.set(key, result);
        caches.contentTypePageLoading.delete(key);
        return result;
      });
    caches.contentTypePageLoading.set(key, loading);
  }
  return loading;
}
