import type { APIContext } from "astro";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { addAlertToSession, alertType, createAlert } from "../../../../alert/index.js";
import { canManageAccount, isMemberOfCurrentTenant, isSharedAccount } from "../../../../auth/accounts.js";
import { getSessionUser } from "../../../../auth/index.js";
import { getDb } from "../../../../db/db.js";
import { userRoles, users, userTenants } from "../../../../db/schema.js";
import { requireTenant } from "../../../../tenant/context.js";

const actionSchema = z.enum(["publish", "unpublish", "delete"]);

const idsSchema = z.array(z.uuid()).min(1);

// Not bulk/index.ts's generic handler: accounts are shared across tenants, so everything here stays
// within this tenant, the same for every admin, super admins included. Publish/unpublish enable or
// disable the accounts on this tenant only (user_tenants.state). Delete deletes an account that
// belongs to this tenant alone, and removes any other from this tenant instead — its membership and
// its roles here — leaving the account itself alone.
export async function POST(context: APIContext): Promise<Response> {
    const parsedAction = actionSchema.safeParse(context.params.action);
    if (!parsedAction.success) {
        return context.rewrite("/admin/404");
    }
    const action = parsedAction.data;

    const formData = await context.request.formData();
    const result = idsSchema.safeParse(formData.getAll("selected[]"));
    if (!result.success) {
        return new Response("Invalid IDs", { status: 400 });
    }

    const editor = await getSessionUser(context.session);
    if (!editor) {
        return context.redirect("/admin/login");
    }

    const db = getDb();
    const tenantId = requireTenant().id;
    const targets = await db
        .select()
        .from(users)
        .where(and(inArray(users.id, result.data), isMemberOfCurrentTenant()));
    if (targets.length === 0) {
        return context.redirect("/admin/users");
    }

    if (action !== "delete") {
        const state = action === "publish" ? 1 : 0;
        await db
            .update(userTenants)
            .set({ state })
            .where(and(inArray(userTenants.userId, targets.map((target) => target.id)), eq(userTenants.tenantId, tenantId)));
        await addAlertToSession(context.session, createAlert(
            alertType.success,
            `${targets.length} user(s) ${state === 1 ? "enabled" : "disabled"} on this site.`,
        ));
        return context.redirect("/admin/users");
    }

    // A super admin's account that belongs here alone still isn't this tenant's admins' to delete
    // (canManageAccount()), so it's removed from this tenant like a shared one.
    const deletable: string[] = [];
    const removable: string[] = [];
    for (const target of targets) {
        const own = !(await isSharedAccount(target.id)) && (await canManageAccount(editor, target));
        (own ? deletable : removable).push(target.id);
    }

    if (deletable.length > 0) {
        await db.update(users).set({ state: -1 }).where(inArray(users.id, deletable));
    }
    if (removable.length > 0) {
        // user_roles is row-level-secured, so this only drops their roles on this tenant.
        await db.delete(userRoles).where(inArray(userRoles.userId, removable));
        await db
            .delete(userTenants)
            .where(and(inArray(userTenants.userId, removable), eq(userTenants.tenantId, tenantId)));
    }

    const parts = [
        ...(deletable.length > 0 ? [`${deletable.length} user(s) deleted.`] : []),
        ...(removable.length > 0 ? [`${removable.length} user(s) were removed from this site rather than deleted, because their accounts also have access to other sites or belong to a super admin.`] : []),
    ];
    await addAlertToSession(context.session, createAlert(alertType.success, parts.join(" ")));

    return context.redirect("/admin/users");
}
