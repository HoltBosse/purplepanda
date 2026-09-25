import type { APIContext } from "astro";
import { eq } from "drizzle-orm";
import * as z from "zod";
import { addAlertToSession, alertType, createAlert } from "../../../../../../alert/index.js";
import { addAction } from "../../../../../../audit/index.js";
import { dashboardAccess } from "../../../../../../auth/dashboard.js";
import { getDb } from "../../../../../../db/db.js";
import { roles, tenants, userRoles, users, userTenants } from "../../../../../../db/schema.js";
import { runWithTenant } from "../../../../../../tenant/context.js";
import { resolveAccountAndSite } from "./_shared.js";

// "<siteId>:<roleId>", or "<siteId>:" for membership without a role.
const targetSchema = z
    .string()
    .regex(/^[^:]+:[^:]*$/)
    .transform((value) => value.split(":") as [string, string])
    .pipe(z.tuple([z.uuid(), z.union([z.uuid(), z.literal("")])]))
    .transform(([siteId, roleId]) => ({ siteId, roleId: roleId || undefined }));

// Adds an account to a site, as a member and optionally with one of that site's roles. The
// account's own fields are untouched; this is the super admin's way of adding someone who already
// has an account elsewhere, which a site's own admins can't do (see admin/users/update).
export async function POST(context: APIContext): Promise<Response> {
    const access = await dashboardAccess(context, { superAdmin: true });
    if (access.response) return access.response;
    const actor = access.user;

    const formData = await context.request.formData();
    const target = targetSchema.safeParse(formData.get("target"));
    if (!target.success) {
        return new Response("Invalid site or role", { status: 400 });
    }
    const { siteId, roleId } = target.data;
    const resolved = await resolveAccountAndSite(context, siteId);
    if (resolved.response) return resolved.response;
    const { account, site } = resolved;

    const db = getDb();
    const added = await runWithTenant(site, async () => {
        // roles are row-level-secured, so a role id from any other site simply isn't found here.
        const [validRole] = roleId
            ? await db.select({ id: roles.id, title: roles.title }).from(roles).where(eq(roles.id, roleId)).limit(1)
            : [];
        if (roleId && !validRole) return null;

        await db.insert(userTenants).values({ userId: account.id, tenantId: site.id }).onConflictDoNothing();
        if (validRole) {
            await db.insert(userRoles).values({ userId: account.id, roleId: validRole.id }).onConflictDoNothing();
        }
        return { roleTitle: validRole?.title };
    });

    if (!added) {
        await addAlertToSession(context.session, createAlert(alertType.error, "That role doesn't belong to that site."));
        return context.redirect(`/dashboard/admin/users/${account.id}`);
    }

    await addAction(
        "user:siteAdd",
        { id: account.id, site: site.id },
        actor.id,
        {
            message: "{id} was added to {site}",
            placeholders: {
                id: { lookupColumn: users.id, displayColumn: users.email },
                site: { lookupColumn: tenants.id, displayColumn: tenants.name },
            },
        },
    );

    await addAlertToSession(context.session, createAlert(
        alertType.success,
        added.roleTitle
            ? `${account.email} was added to ${site.name} as ${added.roleTitle}.`
            : `${account.email} was added to ${site.name}, without a role.`,
    ));
    return context.redirect(`/dashboard/admin/users/${account.id}`);
}
