import { defineMiddleware } from "astro/middleware";
import { eq, and, gte } from "drizzle-orm";
import { getAlertsFromSession, clearAlertsFromSession } from "../alert/index.js";
import { getDb } from "../db/db.js";
import { users, roles, userRoles } from "../db/schema.js";

// Paths that do not require authentication
const PUBLIC_PATHS = ["/admin/login", "/admin/login-action"];

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // Only protect /admin routes, but flash alerts are consumed on public pages too
  // (e.g. by the Puck "Alerts" prefab), so populate/clear them here regardless.
  if (!pathname.startsWith("/admin")) {
    context.locals.alerts = await getAlertsFromSession(context.session);
    await clearAlertsFromSession(context.session);
    return next();
  }

  // Allow public admin paths (login, login-action)
  if (PUBLIC_PATHS.includes(pathname)) {
    return next();
  }

  const userId = await context.session?.get("userId");
  if (!userId) {
    return context.redirect("/admin/login");
  }

  const db = getDb();
  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), gte(users.state, 1)))
    .limit(1);

  if (!user) {
    return context.redirect("/admin/login");
  }

  const [adminRole] = await db
    .select({ id: roles.id })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(and(eq(userRoles.userId, userId), eq(roles.adminAccess, true), gte(roles.state, 1)))
    .limit(1);

  if (!adminRole) {
    return context.redirect("/admin/login");
  }

  // Read and clear flash alerts before the response is committed
  context.locals.alerts = await getAlertsFromSession(context.session);
  await clearAlertsFromSession(context.session);

  return next();
});
