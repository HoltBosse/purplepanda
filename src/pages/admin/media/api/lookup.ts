import type { APIContext } from "astro";
import { getDb } from "../../../../db/db.js";
import { media } from "../../../../db/schema.js";
import { and, eq, ilike, or } from "drizzle-orm";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const search = context.url.searchParams.get("search")?.trim() ?? "";

  const db = getDb();

  const rows = await db
    .select({ id: media.id, title: media.title, alt: media.alt })
    .from(media)
    .where(
      search
        ? and(
            eq(media.state, 1),
            or(
              ilike(media.title, `%${search}%`),
              ilike(media.alt, `%${search}%`),
            ),
          )
        : eq(media.state, 1),
    )
    .limit(50);

  return json(rows);
}
