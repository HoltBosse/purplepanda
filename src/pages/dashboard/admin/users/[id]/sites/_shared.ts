import type { APIContext } from "astro";
import { eq } from "drizzle-orm";
import * as z from "zod";
import { getDb } from "../../../../../../db/db.js";
import { tenants, users } from "../../../../../../db/schema.js";
import type { TenantContext } from "../../../../../../tenant/context.js";

// Shared by add.ts and remove.ts, once they've checked the caller is a super admin on the root site
// (before reading the request body — a rewrite to the 404 page can't re-send a consumed body):
// resolves the account and the site being acted on, or the response to send instead.
export async function resolveAccountAndSite(context: APIContext, siteId: unknown) {
  const accountId = z.uuid().safeParse(context.params.id);
  const tenantId = z.uuid().safeParse(siteId);
  if (!accountId.success || !tenantId.success) {
    return { response: new Response("Invalid account or site", { status: 400 }) };
  }

  const db = getDb();
  const [[account], [tenant]] = await Promise.all([
    db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, accountId.data)).limit(1),
    db.select({ id: tenants.id, name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId.data)).limit(1),
  ]);
  if (!account || !tenant) {
    return { response: new Response("Account or site not found", { status: 404 }) };
  }

  const site: TenantContext = { id: tenant.id, name: tenant.name, isRoot: tenant.id === context.locals.tenant.id };
  return { account, site };
}
