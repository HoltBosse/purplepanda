import type { APIContext } from "astro";
import { eq } from "drizzle-orm";
import * as z from "zod";
import { addAlertToSession, alertType, createAlert } from "../../../../../alert/index.js";
import { addAction } from "../../../../../audit/index.js";
import { dashboardAccess } from "../../../../../auth/dashboard.js";
import { getDb } from "../../../../../db/db.js";
import { users } from "../../../../../db/schema.js";
import { sameOriginReferer } from "../../../../../http/referer.js";

// Grants or revokes super admin on an account. Nobody changes their own: revoking it could leave no
// one able to manage sites, so another super admin has to.
export async function POST(context: APIContext): Promise<Response> {
    const access = await dashboardAccess(context, { superAdmin: true });
    if (access.response) {
        return access.response;
    }

    const id = z.uuid().safeParse(context.params.id);
    if (!id.success) {
        return new Response("Invalid user id", { status: 400 });
    }

    const back = () => context.redirect(sameOriginReferer(context) ?? "/dashboard/admin/users");

    if (id.data === access.user.id) {
        await addAlertToSession(context.session, createAlert(alertType.error, "You can't change your own super admin access."));
        return back();
    }

    const db = getDb();
    const [target] = await db.select({ id: users.id, email: users.email, superAdmin: users.superAdmin }).from(users).where(eq(users.id, id.data)).limit(1);
    if (!target) {
        return new Response("User not found", { status: 404 });
    }

    const superAdmin = !target.superAdmin;
    await db.update(users).set({ superAdmin }).where(eq(users.id, target.id));
    await addAction(
        superAdmin ? "user:superAdminGrant" : "user:superAdminRevoke",
        { id: target.id },
        access.user.id,
        {
            message: superAdmin ? "Super admin was granted to {id}" : "Super admin was revoked from {id}",
            placeholders: { id: { lookupColumn: users.id, displayColumn: users.email } },
        },
    );

    await addAlertToSession(context.session, createAlert(
        alertType.success,
        superAdmin ? `${target.email} is now a super admin.` : `${target.email} is no longer a super admin.`,
    ));
    return back();
}
