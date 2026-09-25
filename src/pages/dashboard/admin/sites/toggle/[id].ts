import type { APIContext } from "astro";
import { and, eq } from "drizzle-orm";
import * as z from "zod";
import { addAlertToSession, alertType, createAlert } from "../../../../../alert/index.js";
import { addAction } from "../../../../../audit/index.js";
import { dashboardAccess } from "../../../../../auth/dashboard.js";
import { invalidateTenantDomainCache } from "../../../../../db/content-cache.js";
import { getDb } from "../../../../../db/db.js";
import { tenantDomains, tenants } from "../../../../../db/schema.js";

// Enables/disables a tenant. A disabled tenant's domains all answer 404 — its public site and its
// admin alike — until it's enabled again; nothing of it is deleted.
export async function POST(context: APIContext): Promise<Response> {
    const access = await dashboardAccess(context, { superAdmin: true });
    if (access.response) {
        return access.response;
    }

    const { id } = context.params;
    if (!id || !z.uuid().safeParse(id).success) {
        return new Response("Missing tenant id", { status: 400 });
    }

    const db = getDb();
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
    if (!tenant) {
        return new Response("Tenant not found", { status: 404 });
    }

    const [rootDomain] = await db
        .select({ id: tenantDomains.id })
        .from(tenantDomains)
        .where(and(eq(tenantDomains.tenantId, id), eq(tenantDomains.isRoot, true)))
        .limit(1);
    if (rootDomain) {
        await addAlertToSession(context.session, createAlert(alertType.error, "The root site can't be disabled."));
        return context.redirect("/dashboard/admin/sites");
    }

    const newState = tenant.state === 1 ? 0 : 1;
    await db.update(tenants).set({ state: newState }).where(eq(tenants.id, id));
    invalidateTenantDomainCache(db);

    const userId = await context.session?.get("userId");
    await addAction(
        newState === 1 ? "tenant:enable" : "tenant:disable",
        { id },
        userId,
        {
            message: newState === 1 ? "Site {id} was enabled" : "Site {id} was disabled",
            placeholders: {
                id: { lookupColumn: tenants.id, displayColumn: tenants.name },
            },
        },
    );

    await addAlertToSession(context.session, createAlert(alertType.success, newState === 1 ? "Site enabled." : "Site disabled."));
    return context.redirect("/dashboard/admin/sites");
}
