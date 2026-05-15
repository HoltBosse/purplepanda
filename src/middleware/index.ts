import { defineMiddleware } from "astro/middleware";
import { getAlertsFromSession, clearAlertsFromSession } from "../alert/index.js";

// Paths that do not require authentication
const PUBLIC_PATHS = ["/admin/login", "/admin/login-action"];

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // Only protect /admin routes
  if (!pathname.startsWith("/admin")) {
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

  // Read and clear flash alerts before the response is committed
  context.locals.alerts = await getAlertsFromSession(context.session);
  await clearAlertsFromSession(context.session);

  return next();
});
