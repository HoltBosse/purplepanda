import type { APIContext } from "astro";
import { eq } from "drizzle-orm";
import * as z from "zod";
import { addAlertToSession, alertType, createAlert } from "../../../../../alert/index.js";
import { addAction } from "../../../../../audit/index.js";
import { dashboardAccess } from "../../../../../auth/dashboard.js";
import { signOutEverywhere } from "../../../../../auth/index.js";
import { getDb } from "../../../../../db/db.js";
import { users } from "../../../../../db/schema.js";
import { sameOriginReferer } from "../../../../../http/referer.js";

// Enables or disables an account everywhere (users.state): a disabled account can't sign in at all,
// on any site, whatever its memberships say. Disabling also ends every sign-in it has. A deleted
// account is enabled again by the same toggle. Nobody changes their own, which would lock them out.
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
        await addAlertToSession(context.session, createAlert(alertType.error, "You can't disable your own account."));
        return back();
    }

    const db = getDb();
    const [target] = await db.select({ id: users.id, email: users.email, state: users.state }).from(users).where(eq(users.id, id.data)).limit(1);
    if (!target) {
        return new Response("User not found", { status: 404 });
    }

    const enabled = target.state !== 1;
    await db.update(users).set({ state: enabled ? 1 : 0 }).where(eq(users.id, target.id));
    if (!enabled) {
        await signOutEverywhere(target.id);
    }
    await addAction(
        enabled ? "user:enable" : "user:disable",
        { id: target.id },
        access.user.id,
        {
            message: enabled ? "{id} was enabled on every site" : "{id} was disabled on every site",
            placeholders: { id: { lookupColumn: users.id, displayColumn: users.email } },
        },
    );

    await addAlertToSession(context.session, createAlert(
        alertType.success,
        enabled ? `${target.email} is enabled.` : `${target.email} is disabled on every site and has been signed out.`,
    ));
    return back();
}
