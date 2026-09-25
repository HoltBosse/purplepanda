import { randomUUID } from "node:crypto";
import type { APIContext } from "astro";
import { eq } from "drizzle-orm";
import * as z from "zod";
import { addAlertToSession, alertType, createAlert } from "../../alert/index.js";
import { getSessionUser, isTenantAdmin } from "../../auth/index.js";
import { createSsoToken } from "../../auth/sso.js";
import { getDb } from "../../db/db.js";
import { tenants } from "../../db/schema.js";
import { runWithTenant } from "../../tenant/context.js";
import { domainSchema, getPrimaryDomain, getTenantDomains, normalizeDomain, pickPrimaryDomain, urlOnDomain } from "../../tenant/index.js";

// Root site only: sends the signed-in account on to a tenant's admin, signed in there (see
// auth/sso.ts). `host` picks which of the tenant's hostnames to land on — the one whose
// /admin/login sent them here, when there was one — and must be one of that tenant's own.
export async function GET(context: APIContext): Promise<Response> {
  if (!context.locals.tenant.isRoot) {
    return context.rewrite("/404");
  }

  const tenantId = z.uuid().safeParse(context.params.tenantId);
  if (!tenantId.success) {
    return context.rewrite("/404");
  }

  const user = await getSessionUser(context.session);
  if (!user) {
    return context.redirect(`/login?site=${tenantId.data}`);
  }

  const db = getDb();
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId.data)).limit(1);
  const domains = tenant ? await getTenantDomains(db, tenant.id) : [];
  const requestedHost = domainSchema.safeParse(context.url.searchParams.get("host"));
  // A site with a primary hostname only serves there, so that's where to land, whatever was asked.
  const primary = tenant ? await getPrimaryDomain(db, tenant.id) : null;
  const domain = primary
    ?? (requestedHost.success && domains.includes(requestedHost.data) ? requestedHost.data : pickPrimaryDomain(domains));

  const allowed = tenant?.state === 1 && domain
    ? await runWithTenant({ id: tenant.id, name: tenant.name, isRoot: tenant.id === context.locals.tenant.id }, () => isTenantAdmin(user))
    : false;
  if (!tenant || !domain || !allowed) {
    await addAlertToSession(context.session, createAlert(alertType.error, "You don't have access to that site."));
    return context.redirect("/dashboard");
  }

  // The root site's own admin shares this very session, so there's nothing to hand over.
  if (tenant.id === context.locals.tenant.id && domain === normalizeDomain(context.url.hostname)) {
    return context.redirect("/admin");
  }

  // The tenant session joins this sign-in. One from before sign-ins had ids gets one now.
  let loginId = await context.session?.get("loginId");
  if (typeof loginId !== "string") {
    loginId = randomUUID();
    context.session?.set("loginId", loginId);
  }
  const token = await createSsoToken(user.id, tenant.id, loginId);
  return context.redirect(urlOnDomain(context.url, domain, `/admin/sso?token=${encodeURIComponent(token)}`));
}
