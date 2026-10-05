import { defineMiddleware } from "astro/middleware";
import * as z from "zod";
import { clearAlertsFromSession, getAlertsFromSession } from "../alert/index.js";
import { isAdminSession } from "../auth/index.js";
import { getDb } from "../db/db.js";
import { runWithTenant } from "../tenant/context.js";
import { getPrimaryDomain, normalizeDomain, resolveTenantForHostname, TLS_ASK_PATH, urlOnDomain } from "../tenant/index.js";

// Paths that do not require authentication
const PUBLIC_PATHS = ["/admin/login", "/admin/sso"];

// Route params that name a row by its id (`[id]`, `[...id]`, `[draftId]`, `[uuid]`, `[typeId]`,
// `[tenantId]`). Every table's id is a uuid, so any other value can't name a row — and handed to
// Postgres as-is it raises "invalid input syntax for type uuid", a 500 rather than the 404 an
// unknown id gets. Checked here once so every route answers the same way. An absent rest param
// (e.g. `update/[...id]` creating a new row) is left to the route.
const ID_PARAMS = ["id", "draftId", "uuid", "typeId", "tenantId"];
const uuidSchema = z.uuid();

function hasMalformedIdParam(params: Record<string, string | undefined>): boolean {
  return ID_PARAMS.some((name) => {
    const value = params[name];
    return value !== undefined && value !== "" && !uuidSchema.safeParse(value).success;
  });
}

export const onRequest = defineMiddleware(async (context, next) => {
  // Asked by the TLS proxy, as no site in particular, whether a hostname is one of any site's.
  if (context.url.pathname === TLS_ASK_PATH) {
    return next();
  }

  const db = getDb();

  // Every request belongs to whichever tenant its hostname is registered to; an unknown hostname,
  // or one whose tenant is disabled, has no site to serve at all.
  const tenant = await resolveTenantForHostname(db, context.url.hostname);
  if (!tenant) {
    return new Response("Site not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  context.locals.tenant = tenant;

  // A tenant that has marked a primary hostname serves only there: its others redirect to the same
  // path on it, permanently. 308 for anything but GET/HEAD, so a form post keeps its method.
  const primary = await getPrimaryDomain(db, tenant.id);
  if (primary && normalizeDomain(context.url.hostname) !== primary) {
    const status = context.request.method === "GET" || context.request.method === "HEAD" ? 301 : 308;
    return context.redirect(urlOnDomain(context.url, primary, `${context.url.pathname}${context.url.search}`), status);
  }

  // Everything downstream — route handlers, page rendering, and so every query they make — runs
  // inside this tenant's context, which is what row-level security scopes each query to (see
  // tenant/context.ts and db/client.ts).
  return runWithTenant(tenant, async () => {
    const { pathname } = context.url;

    // Only protect /admin routes, but flash alerts are consumed on public pages too
    // (e.g. by the Puck "Alerts" prefab), so populate/clear them here regardless.
    if (!pathname.startsWith("/admin")) {
      if (hasMalformedIdParam(context.params)) {
        return context.rewrite("/404");
      }
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

    // Rendered by the admin catch-all ([...path].astro), the admin's own 404 page.
    if (hasMalformedIdParam(context.params)) {
      return context.rewrite("/admin/not-found");
    }

    // Read and clear flash alerts before the response is committed
    const alerts = await getAlertsFromSession(context.session);
    context.locals.alerts = alerts;
    if (alerts.length) {
      clearAlertsFromSession(context.session);
    }

    return next();
  });
});
