import type { APIContext } from "astro";
import { signOut } from "../auth/index.js";

// Root site only: signs this browser out of the root site and every other site at once (see
// signOut()).
export async function POST(context: APIContext): Promise<Response> {
  if (!context.locals.tenant.isRoot) {
    return context.rewrite("/404");
  }
  await signOut(context.session);
  return context.redirect("/login");
}
