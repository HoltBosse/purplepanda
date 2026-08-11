import externalPuckConfig from "virtual:purplepanda/puck-config";
import { and, eq, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { pages } from "./schema.js";

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/^\/+|\/+$/g, "");
}

// Mirrors page.astro's resolvePlainPage/getPagePath walk, but resolves a single page by id
// (used e.g. by the form submit handler to redirect to a chosen page) rather than building a
// path->page map for every plain page up front, which is what page.astro's routing needs instead.
export async function resolvePagePathById(
  db: NodePgDatabase<Record<string, unknown>>,
  pageId: string,
): Promise<string | null> {
  const [page] = await db.select().from(pages).where(and(eq(pages.id, pageId), eq(pages.state, 1))).limit(1);
  if (!page) return null;

  const content = page.content as any;
  const alias: string = content?.root?.props?.alias ?? "";

  if (page.contentType) {
    const contentType = (externalPuckConfig?.contentTypes ?? []).find((ct) => ct.id === page.contentType);
    const base = contentType?.baseUrl ? normalizeBaseUrl(contentType.baseUrl) : "";
    return base ? `${base}/${alias}` : alias;
  }

  const allPages = await db.select().from(pages).where(and(eq(pages.state, 1), isNull(pages.contentType)));
  const pageById = new Map(allPages.map((p) => [p.id, p]));
  pageById.set(page.id, page);

  function getPagePath(pg: NonNullable<typeof page>, visited = new Set<string>()): string {
    if (visited.has(pg.id)) return "";
    const pgContent = pg.content as any;
    const pgAlias: string = pgContent?.root?.props?.alias ?? "";
    const parentId: string = pgContent?.root?.props?.parentPage ?? "";
    const parent = parentId ? pageById.get(parentId) : undefined;
    if (parent) {
      const parentPath = getPagePath(parent, new Set([...visited, pg.id]));
      return parentPath ? `${parentPath}/${pgAlias}` : pgAlias;
    }
    return pgAlias;
  }

  return getPagePath(page);
}
