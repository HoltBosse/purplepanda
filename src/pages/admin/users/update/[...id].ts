import type { APIContext } from "astro";
import { and, eq, getTableColumns, type InferSelectModel, inArray } from 'drizzle-orm';
import * as z from "zod";
import { addAlertToSession, alertType, createAlert } from "../../../../alert/index.js";
import { addTenantMembership, canManageAccount, isMemberOfCurrentTenant } from "../../../../auth/accounts.js";
import { getSessionUser, isTenantMember } from "../../../../auth/index.js";
import { getDb } from "../../../../db/db.js";
import { roles, userRoles, users } from "../../../../db/schema.js";
import { createUserAlertMessageFromArray, formDataToRecord, getAllFields, getFieldByName, validateForm } from "../../../../form/index.js";
import { createFormFlashSession } from "../../../../form/session.js";
import { hash } from "../../../../password/index.js";
import { getProfileForm } from "../../profile/_form.js";

const roleIdsSchema = z.array(z.uuid());

export async function POST(context: APIContext): Promise<Response> {
    const db = getDb();
    //get [id] from url
    const { id } = context.params;
    // A rest param: absent for a new user, otherwise it must be a uuid.
    if (id !== undefined && !z.uuid().safeParse(id).success) {
        return new Response("User not found", { status: 404 });
    }
    const userId = id;
    const isNewUser = !userId;
    let user: InferSelectModel<typeof users> | undefined;

    const editor = await getSessionUser(context.session);
    if (!editor) {
        return context.redirect("/admin/login");
    }

    if (userId) {
        // Only this tenant's members are editable here, however the id was arrived at.
        [user] = await db.select().from(users).where(and(eq(users.id, userId), isMemberOfCurrentTenant())).limit(1);
        if (!user) {
            return new Response("User not found", { status: 404 });
        }
    }

    if (!user) {
        user = Object.fromEntries(
            Object.entries(getTableColumns(users)).map(([key, col]: [string, any]) => {
                let value: unknown;
                if (col.defaultFn !== undefined) value = col.defaultFn();
                else if (col.default !== undefined) value = col.default;
                else if (col.dataType === 'number') value = 0;
                else value = '';
                return [key, value];
            })
        ) as InferSelectModel<typeof users>;
    }

    // See canManageAccount(): a shared account's own fields aren't this tenant's to change, so the
    // form leaves them out and only roles (and membership) are saved.
    const identityLocked = isNewUser ? false : !(await canManageAccount(editor, user));

    const fields = getAllFields();
    const form = getProfileForm(
        user,
        fields,
        isNewUser ? '/admin/users/new' : `/admin/users/edit/${user.id}`,
        {},
        false,
        [],
        [],
        { identityLocked },
    );
    const formData = await context.request.formData();
    const formFlash = createFormFlashSession(context.session);
    const result = validateForm(form, formData);

    const backUrl = isNewUser ? "/admin/users/new" : `/admin/users/edit/${user.id}`;
    const fail = async (message: string) => {
        await formFlash.set('newuser', formDataToRecord(formData));
        await addAlertToSession(context.session, createAlert(alertType.error, message));
        return context.redirect(backUrl);
    };

    if (!result.success) {
        return fail(createUserAlertMessageFromArray(form, result.errors));
    }

    const fname = getFieldByName(form, 'fname')?.value ?? user.fname;
    const lname = getFieldByName(form, 'lname')?.value ?? user.lname;
    const email = getFieldByName(form, 'email')?.value ?? user.email;
    const theme = getFieldByName(form, 'theme')?.value ?? user.theme;
    const password = getFieldByName(form, 'new-password')?.value;
    const confirmPassword = getFieldByName(form, 'confirm-new-password')?.value;

    //check that email isnt used already by another user
    const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);

    let message: string;
    if (isNewUser && existingUser && (!editor.superAdmin || (await isTenantMember(existingUser.id)))) {
        // Only a super admin may add an existing account to a tenant. If a tenant's admins could,
        // one tenant's admin could create an account on their own tenant with a password they
        // know, wait for another tenant to "add" that email, and then sign in there — and adopting
        // an account would also strip its original tenant of the right to manage it.
        return fail("Email is already in use by another account.");
    } else if (isNewUser && existingUser) {
        // Accounts are shared across tenants: a super admin adding an email that already has one
        // adds that account to this tenant rather than creating a duplicate. Its own fields —
        // password included — are left exactly as they were.
        user = existingUser;
        await addTenantMembership(user.id);
        message = "An account with that email already existed, so it was added to this site. Its name and password were left unchanged.";
    } else {
        if (existingUser && existingUser.id !== user.id) {
            return fail("Email is already in use by another account.");
        }

        if (!identityLocked && (isNewUser || password || confirmPassword)) {
            if (isNewUser && !password) {
                return fail("Password is required for new users.");
            }
            if (password !== confirmPassword) {
                return fail("New password and confirm password do not match.");
            }
            user.password = await hash(password!);
        }

        if (isNewUser) {
            user.email = email;
            user.fname = fname;
            user.lname = lname;
            user.theme = theme;
            user.state = 1;

            // `user` is synthesized from the table's column defaults above, so `user.id` is drizzle's
            // `gen_random_uuid()` SQL expression rather than a real id. Adopt the row Postgres actually
            // inserted — otherwise the role assignment below re-evaluates that expression into an
            // unrelated uuid, which the user_roles -> users foreign key rejects outright.
            const [inserted] = await db.insert(users).values(user).returning();
            if (inserted) user = inserted;
            await addTenantMembership(user.id);
            message = "User created successfully.";
        } else {
            if (!identityLocked) {
                await db.update(users).set({ fname, lname, email, theme, password: user.password }).where(eq(users.id, user.id));
            }
            message = "User updated successfully.";
        }
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

    await formFlash.delete('newuser');
    await addAlertToSession(context.session, createAlert(alertType.success, message));

    return context.redirect("/admin/users");
}
