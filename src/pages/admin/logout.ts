import type { APIContext } from "astro";

export async function GET(context: APIContext): Promise<Response> {
  context.session?.destroy();
  return context.redirect("/admin/login");
}
