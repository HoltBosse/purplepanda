import type { APIContext } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../db/db.js";
import { users } from "../../../../db/schema.js";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export async function GET(context: APIContext): Promise<Response> {
  const search = context.url.searchParams.get("search")?.toLowerCase() ?? "";

  const db = getDb();
  const allUsers = await db
    .select({ id: users.id, fname: users.fname, lname: users.lname, email: users.email })
    .from(users)
    .where(eq(users.state, 1));

  const result = allUsers
    .map((user) => ({
      id: user.id,
      label: `${user.fname} ${user.lname}`.trim() || user.email,
    }))
    .filter(({ label }) => !search || label.toLowerCase().includes(search));

  return json(result);
}
