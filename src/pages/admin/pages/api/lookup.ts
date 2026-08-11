import type { APIContext } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../db/db.js";
import { pages } from "../../../../db/schema.js";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const search = context.url.searchParams.get("search")?.toLowerCase() ?? "";

  const db = getDb();
  const allPages = await db.select({ id: pages.id, content: pages.content }).from(pages).where(eq(pages.state, 1));

  const result = allPages
    .map((page) => ({
      id: page.id,
      title: ((page.content as any)?.root?.props?.title as string | undefined) || "Untitled",
    }))
    .filter(({ title }) => !search || title.toLowerCase().includes(search));

  return json(result);
}
