import { defineMiddleware } from "astro/middleware";

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

  return next();
});
