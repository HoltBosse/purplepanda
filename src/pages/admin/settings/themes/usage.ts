import type { APIContext } from "astro";
import { requireSuperAdmin } from "../../../../auth/super-admin.js";
import { getDb } from "../../../../db/db.js";
import { getThemeUsage } from "../../../../theme/server.js";

// Fresh usage counts, fetched by the theme screen right before a delete so the confirmation
// reflects content saved since the screen loaded.
export async function GET(context: APIContext): Promise<Response> {
  const access = await requireSuperAdmin(context);
  if (access.response) return access.response;

  return new Response(JSON.stringify(await getThemeUsage(getDb())), {
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
