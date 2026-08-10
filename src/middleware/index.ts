import { defineMiddleware } from "astro/middleware";
import { clearAlertsFromSession, getAlertsFromSession } from "../alert/index.js";
import { isAdminSession } from "../auth/index.js";

// Paths that do not require authentication
const PUBLIC_PATHS = ["/admin/login", "/admin/login-action"];

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // Only protect /admin routes, but flash alerts are consumed on public pages too
  // (e.g. by the Puck "Alerts" prefab), so populate/clear them here regardless.
  if (!pathname.startsWith("/admin")) {
    const alerts = await getAlertsFromSession(context.session);
    context.locals.alerts = alerts;
    // Every session.set() forces a read-modify-write of the whole session snapshot back to
    // storage (no per-key patching, no locking). Skipping the write when there's nothing to
    // clear avoids doing that on every single request (incl. every /image/:id thumbnail load),
    // which was racing with other writers and intermittently wiping userId out from under
    // logged-in admins. See ccd658a / the isAdminSession-per-image bypass check for why this
    // got worse — it slowed down the very requests piling up here.
    if (alerts.length) {
      clearAlertsFromSession(context.session);
    }
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
  const alerts = await getAlertsFromSession(context.session);
  context.locals.alerts = alerts;
  if (alerts.length) {
    clearAlertsFromSession(context.session);
  }

  return next();
});
