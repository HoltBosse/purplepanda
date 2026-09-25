import type { APIContext } from "astro";
import { and, eq, inArray, ne } from "drizzle-orm";
import * as z from "zod";
import { addAlertToSession, alertType, createAlert } from "../../../../../alert/index.js";
import { addAction } from "../../../../../audit/index.js";
import { dashboardAccess } from "../../../../../auth/dashboard.js";
import { invalidateTenantDomainCache } from "../../../../../db/content-cache.js";
import { getDb } from "../../../../../db/db.js";
import { roles, tenantDomains, tenants } from "../../../../../db/schema.js";
import { createFormFlashSession } from "../../../../../form/session.js";
import { runWithTenant } from "../../../../../tenant/context.js";
import { domainSchema, normalizeDomain, parseDomainList } from "../../../../../tenant/index.js";

const nameSchema = z.string().trim().min(1).max(255);
// One hostname per line: generous for any real site, but bounded.
const domainsSchema = z.string().max(10_000);
// "" for "not the root site", else one of the site's hostnames.
const rootSchema = z.union([z.literal(""), domainSchema]);

export async function POST(context: APIContext): Promise<Response> {
    const access = await dashboardAccess(context, { superAdmin: true });
    if (access.response) {
        return access.response;
    }

    const db = getDb();
    const { id } = context.params;
    const isNew = !id;
    if (id && !z.uuid().safeParse(id).success) {
        return context.rewrite("/404");
    }

    const formData = await context.request.formData();
    const field = (name: string) => {
        const value = formData.get(name);
        return typeof value === "string" ? value : "";
    };
    const rawName = field("name");
    const rawDomains = field("domains");
    const rawRoot = field("root");
    const rawPrimary = field("primary");

    const formFlash = createFormFlashSession(context.session);
    const fail = async (message: string) => {
        await formFlash.set("tenant", { name: rawName, domains: rawDomains, root: rawRoot, primary: rawPrimary });
        await addAlertToSession(context.session, createAlert(alertType.error, message));
        return context.redirect(isNew ? "/dashboard/admin/sites/new" : `/dashboard/admin/sites/edit/${id}`);
    };

    const name = nameSchema.safeParse(rawName);
    if (!name.success) {
        return fail("A site name is required.");
    }

    const domainsField = domainsSchema.safeParse(rawDomains);
    if (!domainsField.success) {
        return fail("That's too many domains.");
    }
    const { domains, invalid } = parseDomainList(domainsField.data);
    if (invalid.length > 0) {
        return fail(`Not a valid hostname: ${invalid.join(", ")}. Enter bare hostnames like example.com, without scheme, port or path.`);
    }
    if (domains.length === 0) {
        return fail("A site needs at least one domain.");
    }

    const taken = await db
        .select({ domain: tenantDomains.domain })
        .from(tenantDomains)
        .where(and(inArray(tenantDomains.domain, domains), id ? ne(tenantDomains.tenantId, id) : undefined));
    if (taken.length > 0) {
        return fail(`Already used by another site: ${taken.map((row) => row.domain).join(", ")}.`);
    }

    let existingDomains: { domain: string; isRoot: boolean }[] = [];
    if (id) {
        const [existing] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, id)).limit(1);
        if (!existing) {
            return context.rewrite("/404");
        }
        existingDomains = await db
            .select({ domain: tenantDomains.domain, isRoot: tenantDomains.isRoot })
            .from(tenantDomains)
            .where(eq(tenantDomains.tenantId, id));
    }

    // The root domain: must stay one of the root tenant's own domains (there always has to be one,
    // or nobody could manage tenants), and choosing one of another tenant's domains moves it there.
    const wasRoot = existingDomains.some((domain) => domain.isRoot);
    const rootField = rootSchema.safeParse(rawRoot);
    if (!rootField.success) {
        return fail("The root domain has to be one of this site's domains.");
    }
    const root = rootField.data || null;

    // The hostname the site's others redirect to, or "" for none. Same shape as the root field.
    const primaryField = rootSchema.safeParse(rawPrimary);
    const primary = primaryField.success ? primaryField.data || null : undefined;
    if (primary === undefined || (primary && !domains.includes(primary))) {
        return fail("The primary domain has to be one of this site's domains.");
    }
    if (root && !domains.includes(root)) {
        return fail("The root domain has to be one of this site's domains.");
    }
    if (wasRoot && !root) {
        return fail("This is the root site, so one of its domains has to stay the root domain. To move the root, edit the site that should become root instead.");
    }

    // Don't let a super admin cut off the very domain they're managing tenants through.
    if (id === context.locals.tenant.id && !domains.includes(normalizeDomain(context.url.hostname) ?? "")) {
        return fail(`You're signed in through ${context.url.hostname}, so it can't be removed from this site here.`);
    }

    const tenantId = await db.transaction(async (tx) => {
        let savedId: string;
        if (id) {
            await tx.update(tenants).set({ name: name.data }).where(eq(tenants.id, id));
            savedId = id;
        } else {
            const [inserted] = await tx.insert(tenants).values({ name: name.data }).returning({ id: tenants.id });
            savedId = inserted!.id;
        }

        const removed = existingDomains.map((domain) => domain.domain).filter((domain) => !domains.includes(domain));
        if (removed.length > 0) {
            await tx.delete(tenantDomains).where(and(eq(tenantDomains.tenantId, savedId), inArray(tenantDomains.domain, removed)));
        }
        const added = domains.filter((domain) => !existingDomains.some((existing) => existing.domain === domain));
        if (added.length > 0) {
            await tx.insert(tenantDomains).values(added.map((domain) => ({ tenantId: savedId, domain })));
        }

        // Cleared first: the partial unique index allows only one primary per site at any moment. A
        // new site's form has no primary field, so it starts with none.
        await tx.update(tenantDomains).set({ isPrimary: false }).where(eq(tenantDomains.tenantId, savedId));
        if (primary) {
            await tx.update(tenantDomains).set({ isPrimary: true }).where(and(eq(tenantDomains.tenantId, savedId), eq(tenantDomains.domain, primary)));
        }

        if (root) {
            // Cleared everywhere first: the partial unique index allows only one root at any moment.
            await tx.update(tenantDomains).set({ isRoot: false }).where(eq(tenantDomains.isRoot, true));
            await tx.update(tenantDomains).set({ isRoot: true }).where(and(eq(tenantDomains.tenantId, savedId), eq(tenantDomains.domain, root)));
        }
        return savedId;
    });

    invalidateTenantDomainCache(db);

    if (isNew) {
        // A new tenant starts with one admin-access role, so its first users can be given admin
        // access without first having to author a role. Written in the new tenant's context (after
        // the transaction above committed it) since roles are row-level-secured.
        await runWithTenant({ id: tenantId, name: name.data, isRoot: false }, () =>
            db.insert(roles).values({ title: "Administrator", adminAccess: true }),
        );
    }

    const userId = await context.session?.get("userId");
    await addAction(
        isNew ? "tenant:create" : "tenant:update",
        { id: tenantId },
        userId,
        {
            message: isNew ? "Site {id} was created" : "Site {id} was updated",
            placeholders: {
                id: { lookupColumn: tenants.id, displayColumn: tenants.name },
            },
        },
    );

    await formFlash.delete("tenant");
    // Saving a primary for the very site this is being done from means the next page load redirects
    // off this hostname — and sessions don't follow across hostnames.
    const movedAway = id === context.locals.tenant.id && primary && primary !== normalizeDomain(context.url.hostname);
    await addAlertToSession(context.session, createAlert(
        alertType.success,
        isNew ? "Site created." : movedAway ? `Site updated. This site now redirects to ${primary}; sign in again there.` : "Site updated.",
    ));
    return context.redirect("/dashboard/admin/sites");
}
