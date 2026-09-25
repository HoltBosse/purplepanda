import type { APIContext } from "astro";
import { and, eq } from "drizzle-orm";
import * as z from "zod";
import { addAlertToSession, alertType, createAlert } from "../../../../alert/index.js";
import { getSessionUser } from "../../../../auth/index.js";
import { getDb } from "../../../../db/db.js";
import { users, userTenants } from "../../../../db/schema.js";
import { sameOriginReferer } from "../../../../http/referer.js";
import { requireTenant } from "../../../../tenant/context.js";

// Enables or disables an account on this tenant only (user_tenants.state), the same for every
// admin, super admins included: the account itself and its other tenants are left alone. Turning
// the account off everywhere is the root tenant's Admin → Users.
export async function POST(context: APIContext): Promise<Response> {
    const db = getDb();
    const { id } = context.params;

    if (!id || !z.uuid().safeParse(id).success) {
        return new Response("Missing user id", { status: 400 });
    }

    const editor = await getSessionUser(context.session);
    if (!editor) {
        return context.redirect("/admin/login");
    }

    const [membership] = await db
        .select({ id: userTenants.id, state: userTenants.state, superAdmin: users.superAdmin })
        .from(userTenants)
        .innerJoin(users, eq(users.id, userTenants.userId))
        .where(and(eq(userTenants.userId, id), eq(userTenants.tenantId, requireTenant().id)))
        .limit(1);
    if (!membership) {
        return new Response("User not found", { status: 404 });
    }

    const newState = membership.state === 1 ? 0 : 1;
    await db.update(userTenants).set({ state: newState }).where(eq(userTenants.id, membership.id));

    let message = newState === 1 ? "User enabled on this site." : "User disabled on this site.";
    if (newState === 0 && membership.superAdmin) {
        message += " As a global admin, they can still open this site's admin.";
    }
    await addAlertToSession(context.session, createAlert(alertType.success, message));

    const back = sameOriginReferer(context);
    if (back) {
        return context.redirect(back);
    }

    return context.redirect("/admin/users");
}
