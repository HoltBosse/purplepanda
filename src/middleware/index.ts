import { defineMiddleware } from "astro/middleware";
import { getAlertsFromSession, clearAlertsFromSession } from "../alert/index.js";
import { isAdminSession } from "../auth/index.js";

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

  if (!(await isAdminSession(context.session))) {
    return context.redirect("/admin/login");
  }

  // Read and clear flash alerts before the response is committed
  context.locals.alerts = await getAlertsFromSession(context.session);
  await clearAlertsFromSession(context.session);

  return next();
});
