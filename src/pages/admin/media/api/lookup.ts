import type { APIContext } from "astro";
import { getDb } from "../../../../db/db.js";
import { media, mediafolders } from "../../../../db/schema.js";
import { and, eq, ilike, isNull, notInArray, or, sql } from "drizzle-orm";
import { z } from "zod";

const PER_PAGE = 24;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// A folder is hidden if it (or any ancestor) has visibility -1. Computed in memory from a single
// query rather than a recursive CTE — the folder tree is small and this mirrors the same
// ancestor-walk approach used elsewhere (e.g. the delete route's descendant walk).
async function getHiddenFolderIds(db: ReturnType<typeof getDb>): Promise<Set<string>> {
  const allFolders = await db
    .select({ id: mediafolders.id, parent: mediafolders.parent, visibility: mediafolders.visibility })
    .from(mediafolders)
    .where(eq(mediafolders.state, 1));

  const byId = new Map(allFolders.map((f) => [f.id, f]));
  const memo = new Map<string, boolean>();

  const isHidden = (id: string, visited: Set<string> = new Set()): boolean => {
    if (memo.has(id)) return memo.get(id)!;
    if (visited.has(id)) return false; // cycle guard
    visited.add(id);

    const folder = byId.get(id);
    if (!folder) return false;

    const hidden = folder.visibility === -1 || (folder.parent ? isHidden(folder.parent, visited) : false);
    memo.set(id, hidden);
    return hidden;
  };

  const hiddenIds = new Set<string>();
  for (const folder of allFolders) {
    if (isHidden(folder.id)) hiddenIds.add(folder.id);
  }
  return hiddenIds;
}

export async function GET(context: APIContext): Promise<Response> {
  const search = context.url.searchParams.get("search")?.trim() ?? "";

  // Reject invalid folder ids before hitting Postgres' uuid comparison; an invalid one falls back
  // to the root listing rather than erroring.
  const folderParam = context.url.searchParams.get("folder")?.trim() ?? "";
  const folderId = folderParam && z.uuid().safeParse(folderParam).success ? folderParam : null;

  const pageParsed = z.coerce.number().int().positive().default(1).safeParse(context.url.searchParams.get("page") ?? 1);
  const page = pageParsed.success ? pageParsed.data : 1;
  const offset = (page - 1) * PER_PAGE;

  const db = getDb();
  const hiddenFolderIds = await getHiddenFolderIds(db);

  // The folder being browsed is itself hidden (or under a hidden ancestor) — don't leak its
  // contents just because they were requested directly.
  if (!search && folderId && hiddenFolderIds.has(folderId)) {
    return json({ folders: [], images: [], page, totalPages: 1 });
  }

  // media.folder is nullable (root items), and SQL's `NOT IN` treats a NULL column as neither in
  // nor out of the list — so the hidden-folder exclusion must not apply to null-folder rows at all.
  const hiddenFolderExclusion = hiddenFolderIds.size > 0
    ? or(isNull(media.folder), notInArray(media.folder, [...hiddenFolderIds]))
    : undefined;

  // When searching we look across every folder and don't surface folders at all — the result is a
  // flat, paginated list of matching images.
  const imageWhere = search
    ? and(eq(media.state, 1), or(ilike(media.title, `%${search}%`), ilike(media.alt, `%${search}%`)), hiddenFolderExclusion)
    : and(folderId ? eq(media.folder, folderId) : isNull(media.folder), eq(media.state, 1), hiddenFolderExclusion);

  const images = await db
    .select({ id: media.id, title: media.title, alt: media.alt })
    .from(media)
    .where(imageWhere)
    .orderBy(media.title)
    .limit(PER_PAGE)
    .offset(offset);

  const totalImages = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(media)
    .where(imageWhere)
    .then((result) => Number(result[0]?.count ?? 0));

  const totalPages = Math.max(1, Math.ceil(totalImages / PER_PAGE));

  const folders = search
    ? []
    : await db
        .select({ id: mediafolders.id, name: mediafolders.name })
        .from(mediafolders)
        .where(and(
          folderId ? eq(mediafolders.parent, folderId) : isNull(mediafolders.parent),
          eq(mediafolders.state, 1),
          hiddenFolderIds.size > 0 ? notInArray(mediafolders.id, [...hiddenFolderIds]) : undefined,
        ))
        .orderBy(mediafolders.name);

  return json({ folders, images, page, totalPages });
}
