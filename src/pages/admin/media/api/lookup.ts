import type { APIContext } from "astro";
import { getDb } from "../../../../db/db.js";
import { media, mediafolders } from "../../../../db/schema.js";
import { and, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";

const PER_PAGE = 24;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
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

  // When searching we look across every folder and don't surface folders at all — the result is a
  // flat, paginated list of matching images.
  const imageWhere = search
    ? and(eq(media.state, 1), or(ilike(media.title, `%${search}%`), ilike(media.alt, `%${search}%`)))
    : and(folderId ? eq(media.folder, folderId) : isNull(media.folder), eq(media.state, 1));

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
        .where(and(folderId ? eq(mediafolders.parent, folderId) : isNull(mediafolders.parent), eq(mediafolders.state, 1)))
        .orderBy(mediafolders.name);

  return json({ folders, images, page, totalPages });
}
