import { and, eq, isNull, sql } from "drizzle-orm";
import type { InferSelectModel } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { pages, templates, settings } from "./schema.js";

type Db = NodePgDatabase<Record<string, unknown>>;
type PageRow = InferSelectModel<typeof pages>;
type TemplateRow = InferSelectModel<typeof templates>;

export type BreadcrumbEntry = { title: string; path: string };
type PageWithBreadcrumbs = { page: PageRow; breadcrumbs: BreadcrumbEntry[] };

// Public page renders read site settings, fonts, the default-template mapping, and the whole
// page tree on every single request, but none of it changes except through the admin write paths
// (settings/update, pages/update & toggle & bulk & drafts/publish, templates/update & toggle &
// bulk, content/* — content items live in the `pages` table too). So it's cached in-process for
// the life of the server rather than on a TTL, and those handlers call the invalidate* functions
// below after writing. A `*Loading` promise alongside each cache guards against a thundering herd
// of concurrent requests all missing the cache at once and firing the same query repeatedly.
let settingsCache: Map<string, unknown> | null = null;
let settingsLoading: Promise<Map<string, unknown>> | null = null;

let templatesCache: Map<string, TemplateRow> | null = null;
let templatesLoading: Promise<Map<string, TemplateRow>> | null = null;

let pageTreeCache: Map<string, PageWithBreadcrumbs> | null = null;
let pageTreeLoading: Promise<Map<string, PageWithBreadcrumbs>> | null = null;

const contentTypePageCache = new Map<string, PageRow | undefined>();
const contentTypePageLoading = new Map<string, Promise<PageRow | undefined>>();

export function invalidateSettingsCache(): void {
  settingsCache = null;
  settingsLoading = null;
}

export function invalidateTemplatesCache(): void {
  templatesCache = null;
  templatesLoading = null;
}

export function invalidatePagesCache(): void {
  pageTreeCache = null;
  pageTreeLoading = null;
  contentTypePageCache.clear();
  contentTypePageLoading.clear();
}

async function loadSettingsMap(db: Db): Promise<Map<string, unknown>> {
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
