import type { APIContext } from "astro";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../../../db/db.js";
import { flattenTree, groupByParent, subtreeIds } from "../../../../db/page-tree.js";
import { pages } from "../../../../db/schema.js";

// Backs the editor's parent page picker (puck/component-fields/ParentPageField.tsx).
//   ?id=<uuid>                     -> { id, title } for the currently selected parent's label
//   ?search=&page=&exclude=<uuid>  -> { pages: [{ id, title, depth }], totalPages }
// Browsing mirrors the pages admin list: paginated by root with each subtree kept whole, while a
// search is shown flat. `exclude` (the page being edited) drops that page and its descendants,
// since parenting under either would create a cycle.

const itemsPerPage = 12;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const params = context.url.searchParams;
  const db = getDb();

  // Only published plain pages — that's all page routing resolves a parentPage against (see
  // db/page-path.ts), so anything else would be silently ignored as a parent.
  const candidates = await db
    .select({
      id: pages.id,
      title: sql<string | null>`${pages.content} -> 'root' -> 'props' ->> 'title'`,
      parentPage: sql<string | null>`${pages.content} -> 'root' -> 'props' ->> 'parentPage'`,
    })
    .from(pages)
    .where(and(eq(pages.state, 1), isNull(pages.contentType)))
    .orderBy(desc(pages.id));

  const titleOf = (page: { title: string | null }) => page.title || "Untitled";

  const selectedId = params.get("id");
  if (selectedId !== null) {
    const page = candidates.find((candidate) => candidate.id === selectedId);
    return page ? json({ id: page.id, title: titleOf(page) }) : json({ error: "Not found" }, 404);
  }

  const search = params.get("search")?.trim().toLowerCase() ?? "";
  const pageParam = z.coerce.number().int().positive().catch(1).parse(params.get("page") ?? 1);
  const excludeId = params.get("exclude");

  const childrenByParent = groupByParent(candidates, (candidate) => candidate.parentPage);
  const excluded = excludeId ? subtreeIds(excludeId, childrenByParent) : new Set<string>();
  const visible = candidates.filter((candidate) => !excluded.has(candidate.id));

  let rows: { page: (typeof candidates)[number]; depth: number }[];
  let totalPages: number;
  if (search) {
    const matches = visible.filter((candidate) => titleOf(candidate).toLowerCase().includes(search));
    totalPages = Math.max(1, Math.ceil(matches.length / itemsPerPage));
    rows = matches.slice((pageParam - 1) * itemsPerPage, pageParam * itemsPerPage).map((page) => ({ page, depth: 1 }));
  } else {
    // A parent that isn't a published plain page reads as top level, same as routing treats it.
    const visibleIds = new Set(visible.map((candidate) => candidate.id));
    const roots = visible.filter((candidate) => !candidate.parentPage || !visibleIds.has(candidate.parentPage));
    totalPages = Math.max(1, Math.ceil(roots.length / itemsPerPage));
    const visibleChildren = groupByParent(visible, (candidate) => candidate.parentPage);
    rows = flattenTree(roots.slice((pageParam - 1) * itemsPerPage, pageParam * itemsPerPage), visibleChildren);
  }

  return json({
    pages: rows.map(({ page, depth }) => ({ id: page.id, title: titleOf(page), depth })),
    totalPages,
  });
}
