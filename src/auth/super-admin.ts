import type { APIContext, AstroGlobal } from "astro";
import { type AccessResult, getSessionUser } from "./index.js";

// The gate for admin pages and routes only super admins may use (e.g. /admin/settings/themes).
// The /admin middleware has already required an admin session; this also requires the account to
// be a super admin, and otherwise answers with the admin's own not-found page, as if the page didn't
// exist (the way dashboardAccess hides /dashboard/admin).
// Returns the account, or the response to send instead.
export async function requireSuperAdmin(
  context: AstroGlobal | APIContext,
): Promise<AccessResult> {
  const user = await getSessionUser(context.session);
  if (!user?.superAdmin) {
    return { response: await context.rewrite("/admin/not-found") };
  }
  return { user };
}
