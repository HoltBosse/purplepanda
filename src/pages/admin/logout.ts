import type { APIContext } from "astro";
import { signOut } from "../../auth/index.js";

export async function POST(context: APIContext): Promise<Response> {
  await signOut(context.session);
  return context.redirect("/admin/login");
}
