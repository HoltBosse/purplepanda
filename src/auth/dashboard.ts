import type { APIContext, AstroGlobal } from "astro";
import { getSessionUser } from "./index.js";

type DashboardUser = NonNullable<Awaited<ReturnType<typeof getSessionUser>>>;

// The gate for everything under /dashboard: it only exists on the root site, needs an account
// signed in there (else it goes to /login), and /dashboard/admin/* needs that account to be a super
// admin as well. Returns the account, or the response to send instead.
export async function dashboardAccess(
  context: AstroGlobal | APIContext,
  options: { superAdmin?: boolean } = {},
): Promise<{ user: DashboardUser; response?: undefined } | { user?: undefined; response: Response }> {
  if (!context.locals.tenant.isRoot) {
    return { response: await context.rewrite("/404") };
  }
  const user = await getSessionUser(context.session);
  if (!user) {
    return { response: context.redirect("/login") };
  }
  if (options.superAdmin && !user.superAdmin) {
    return { response: await context.rewrite("/404") };
  }
  return { user };
}
