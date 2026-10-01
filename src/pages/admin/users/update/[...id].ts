import { randomBytes } from "node:crypto";
import type { APIContext } from "astro";
import { and, eq, inArray } from 'drizzle-orm';
import * as z from "zod";
import { addAlertToSession, alertType, createAlert } from "../../../../alert/index.js";
import { addAction } from "../../../../audit/index.js";
import { sendAddedToSiteEmail, sendInviteEmail } from "../../../../auth/account-mail.js";
import { addTenantMembership, canManageAccount, isMemberOfCurrentTenant } from "../../../../auth/accounts.js";
import { getSessionUser, isTenantMember } from "../../../../auth/index.js";
import { getDb } from "../../../../db/db.js";
import { roles, userRoles, users } from "../../../../db/schema.js";
import { createUserAlertMessageFromArray, formDataToRecord, getAllFields, getFieldByName, validateForm } from "../../../../form/index.js";
import { createFormFlashSession } from "../../../../form/session.js";
import { hash } from "../../../../password/index.js";
import { linkUrlOnDomain, normalizeDomain } from "../../../../tenant/index.js";
import { getEditUserForm, getInviteForm } from "../_form.js";

const roleIdsSchema = z.array(z.uuid());

// Saves the users admin form (../new.astro): with no id, an invitation; with one, a member's name
// and roles. A site's admin never sets anyone's password here — an invited account's owner chooses
// their own from the emailed link (see auth/account-mail.ts).
export async function POST(context: APIContext): Promise<Response> {
    const db = getDb();
    //get [id] from url
    const { id } = context.params;
    // A rest param: absent for a new user, otherwise it must be a uuid.
    if (id !== undefined && !z.uuid().safeParse(id).success) {
        return new Response("User not found", { status: 404 });
    }

    const editor = await getSessionUser(context.session);
    if (!editor) {
        return context.redirect("/admin/login");
    }

    let user: typeof users.$inferSelect | undefined;
    if (id) {
        // Only this tenant's members are editable here, however the id was arrived at.
        [user] = await db.select().from(users).where(and(eq(users.id, id), isMemberOfCurrentTenant())).limit(1);
        if (!user) {
            return new Response("User not found", { status: 404 });
        }
    }

    const fields = getAllFields();
    // See canManageAccount(): a shared account's own fields aren't this tenant's to change, so the
    // form leaves them out and only roles are saved.
    const identityLocked = user ? !(await canManageAccount(editor, user)) : false;
    const form = user
        ? getEditUserForm(user, fields, `/admin/users/update/${user.id}`, {}, [], [], { identityLocked, resetAction: "" })
        : getInviteForm(fields, "/admin/users/update");
    const formData = await context.request.formData();
    const formFlash = createFormFlashSession(context.session);
    const result = validateForm(form, formData);

    const backUrl = user ? `/admin/users/edit/${user.id}` : "/admin/users/new";
    const fail = async (message: string) => {
        await formFlash.set('user', formDataToRecord(formData));
        await addAlertToSession(context.session, createAlert(alertType.error, message));
        return context.redirect(backUrl);
    };

    if (!result.success) {
        return fail(createUserAlertMessageFromArray(form, result.errors));
    }

    let message: string;
    let messageType = alertType.success;
    if (user) {
        if (!identityLocked) {
            const fname = getFieldByName(form, 'fname')?.value ?? user.fname;
            const lname = getFieldByName(form, 'lname')?.value ?? user.lname;
            await db.update(users).set({ fname, lname }).where(eq(users.id, user.id));
        }
        message = "User updated successfully.";
    } else {
        const fname = getFieldByName(form, 'fname')?.value ?? '';
        const lname = getFieldByName(form, 'lname')?.value ?? '';
        const email = getFieldByName(form, 'email')?.value ?? '';
        const siteName = context.locals.tenant.name;

        const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        let sent: boolean;
        if (existingUser) {
            // Accounts are shared across tenants: inviting an email that already has one adds that
            // account to this tenant rather than creating a duplicate, leaving its own fields — name
            // and password included — as they were. Nobody here ever set that password, so this
            // can't be used to plant an account someone else's site then adopts.
            if (await isTenantMember(existingUser.id)) {
                return fail("That account is already a member of this site.");
            }
            if (existingUser.state < 1) {
                return fail("That account is disabled, so it can't be added to this site.");
            }
            user = existingUser;
            await addTenantMembership(user.id);
            const adminUrl = linkUrlOnDomain(normalizeDomain(context.url.hostname) ?? context.url.hostname, "/admin");
            sent = await sendAddedToSiteEmail(user, siteName, adminUrl);
            message = sent
                ? "An account with that email already existed, so it was added to this site and they've been emailed to let them know."
                : "An account with that email already existed, so it was added to this site. No email could be sent because outgoing email isn't configured.";
        } else {
            // No usable password until the owner sets one from the invite link: a hash of random bytes
            // nobody knows, so signing in with it costs the same as any wrong password.
            const [inserted] = await db
                .insert(users)
                .values({ email, fname, lname, state: 1, password: await hash(randomBytes(32).toString("base64url")) })
                .returning();
            if (!inserted) throw new Error("Failed to create user");
            user = inserted;
            await addTenantMembership(user.id);
            // Once they've set a password and signed in, they land back on this site's admin.
            const host = normalizeDomain(context.url.hostname);
            sent = await sendInviteEmail(user, siteName, { site: context.locals.tenant.id, ...(host ? { host } : {}) });
            message = sent
                ? "Invitation sent. They'll get an email with a link to set up their password."
                : "User created, but no invitation could be sent because outgoing email isn't configured.";
        }
        if (!sent) messageType = alertType.warning;
        await addAction(
            "user:invite",
            { id: user.id, existing: Boolean(existingUser) },
            editor.id,
            {
                message: "{id} was invited",
                placeholders: { id: { lookupColumn: users.id, displayColumn: users.email } },
            },
        );
    }

    // Only roles that exist in this tenant: roles are row-level-secured, so a posted id belonging to
    // another tenant simply doesn't come back from this query.
    const roleIdsResult = roleIdsSchema.safeParse(formData.getAll('roles[]').map(String));
    const requestedRoleIds = roleIdsResult.success ? roleIdsResult.data : [];
    const roleIds = requestedRoleIds.length > 0
        ? (await db.select({ id: roles.id }).from(roles).where(inArray(roles.id, requestedRoleIds))).map((row) => row.id)
        : [];

    // user_roles is row-level-secured too, so this only clears the account's roles in this tenant.
    const accountId = user.id;
    await db.delete(userRoles).where(eq(userRoles.userId, accountId));
    if (roleIds.length > 0) {
        await db.insert(userRoles).values(roleIds.map(roleId => ({ userId: accountId, roleId })));
    }

    await formFlash.delete('user');
    await addAlertToSession(context.session, createAlert(messageType, message));

    return context.redirect("/admin/users");
}
