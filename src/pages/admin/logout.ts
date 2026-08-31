import type { APIContext } from "astro";
import { emit } from "../../hooks/index.js";

export async function POST(context: APIContext): Promise<Response> {
  const userId = await context.session?.get("userId");
  context.session?.destroy();
  if (userId) {
    await emit("auth:logout", { userId });
  }
  return context.redirect("/admin/login");
}
