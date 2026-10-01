import type { APIContext } from "astro";
import { and, eq, gte } from "drizzle-orm";
import * as z from "zod";
import { addAlertToSession, alertType, createAlert } from "../../../../alert/index.js";
import { addAction } from "../../../../audit/index.js";
import { sendPasswordResetEmail } from "../../../../auth/account-mail.js";
import { isMemberOfCurrentTenant } from "../../../../auth/accounts.js";
import { getSessionUser } from "../../../../auth/index.js";
import { recordResetRequest } from "../../../../auth/password-reset.js";
import { getDb } from "../../../../db/db.js";
import { users } from "../../../../db/schema.js";
import { normalizeDomain } from "../../../../tenant/index.js";

// The edit user form's "Send password reset" button: emails a member the same reset link
// /forgot-password would. Only the link is sent — the account stays signed in everywhere, with its
// current password, until its owner uses it. The link goes to the owner's own inbox, so unlike
// changing the password this is open for shared accounts too; it counts against the same limits as
// /forgot-password so it can't be used to flood that inbox.
export async function POST(context: APIContext): Promise<Response> {
    const id = z.uuid().safeParse(context.params.id);
    const editor = await getSessionUser(context.session);
    if (!editor) {
        return context.redirect("/admin/login");
    }
    const [user] = id.success
        ? await getDb()
            .select({ id: users.id, email: users.email, fname: users.fname })
            .from(users)
            .where(and(eq(users.id, id.data), gte(users.state, 1), isMemberOfCurrentTenant()))
            .limit(1)
        : [];
    if (!user) {
        return new Response("User not found", { status: 404 });
    }

    const backUrl = `/admin/users/edit/${user.id}`;
    const alert = async (type: alertType, message: string) => {
        await addAlertToSession(context.session, createAlert(type, message));
        return context.redirect(backUrl);
    };

    if (!(await recordResetRequest(user.email, context.clientAddress))) {
        return alert(alertType.error, "Too many password resets have been sent for this account. Please wait a while and try again.");
    }

    // Once they've reset it and signed in, they land back on this site's admin.
    const host = normalizeDomain(context.url.hostname);
    const sent = await sendPasswordResetEmail(user, context.locals.tenant.name, {
        site: context.locals.tenant.id,
        ...(host ? { host } : {}),
    });
    if (!sent) {
        return alert(alertType.warning, "No password reset could be sent because outgoing email isn't configured.");
    }

    await addAction(
        "user:passwordResetSent",
        { id: user.id },
        editor.id,
        {
            message: "A password reset was sent to {id}",
            placeholders: { id: { lookupColumn: users.id, displayColumn: users.email } },
        },
    );
    return alert(alertType.success, `A password reset link has been sent to ${user.email}.`);
}
