import type { APIContext } from "astro";
import { and, eq } from "drizzle-orm";
import { addAlertToSession, alertType, createAlert } from "../../../../../../alert/index.js";
import { addAction } from "../../../../../../audit/index.js";
import { dashboardAccess } from "../../../../../../auth/dashboard.js";
import { getDb } from "../../../../../../db/db.js";
import { tenants, userRoles, users, userTenants } from "../../../../../../db/schema.js";
import { runWithTenant } from "../../../../../../tenant/context.js";
import { resolveAccountAndSite } from "./_shared.js";

// Removes an account from a site: its membership and its roles there. The account itself, and its
// other sites, are untouched.
export async function POST(context: APIContext): Promise<Response> {
    const access = await dashboardAccess(context, { superAdmin: true });
    if (access.response) return access.response;
    const actor = access.user;

    const formData = await context.request.formData();
    const resolved = await resolveAccountAndSite(context, formData.get("site"));
    if (resolved.response) return resolved.response;
    const { account, site } = resolved;

    const db = getDb();
    await runWithTenant(site, async () => {
        // user_roles is row-level-secured, so this only drops the account's roles on this site.
        await db.delete(userRoles).where(eq(userRoles.userId, account.id));
        await db.delete(userTenants).where(and(eq(userTenants.userId, account.id), eq(userTenants.tenantId, site.id)));
    });

    await addAction(
        "user:siteRemove",
        { id: account.id, site: site.id },
        actor.id,
        {
            message: "{id} was removed from {site}",
            placeholders: {
                id: { lookupColumn: users.id, displayColumn: users.email },
                site: { lookupColumn: tenants.id, displayColumn: tenants.name },
            },
        },
    );

    await addAlertToSession(context.session, createAlert(alertType.success, `${account.email} was removed from ${site.name}.`));
    return context.redirect(`/dashboard/admin/users/${account.id}`);
}
