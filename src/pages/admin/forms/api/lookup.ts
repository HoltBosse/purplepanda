import type { APIContext } from "astro";
import { getDb } from "../../../../db/db.js";
import { forms } from "../../../../db/schema.js";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const search = context.url.searchParams.get("search")?.toLowerCase() ?? "";

  const db = getDb();
  const allForms = await db.select({ id: forms.id, content: forms.content }).from(forms);

  const result = allForms
    .map((form) => ({
      id: form.id,
      name: ((form.content as any)?.root?.props?.name as string | undefined) || "Untitled",
    }))
    .filter(({ name }) => !search || name.toLowerCase().includes(search));

  return json(result);
}
