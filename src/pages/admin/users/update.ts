import type { APIContext } from "astro";
import { createAlert, alertType, addAlertToSession } from "../../../alert/index.js";
import { validateForm, createUserAlertMessageFromArray, getFieldByName, formDataToRecord } from "../../../form/index.js";
import { createFormFlashSession } from "../../../form/session.js";
import { getProfileForm } from "../profile/form.js";
import { getAllFields } from "../../../form/index.js";
import { getDb } from "../../../db/db.js";
import { users } from "../../../db/schema.js";
import { eq, getTableColumns, type InferSelectModel } from 'drizzle-orm';
import { get } from "node:http";
import { hash } from "../../../password/index.js";

export async function POST(context: APIContext): Promise<Response> {
    const db = getDb();
    //get [id] from url
    const { id } = context.params;
    console.log("ID:");
    console.log(id);
    const userId = id;
    let isNewUser = !userId;
    let user: InferSelectModel<typeof users> | undefined;

    if (userId) {
        [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
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

    const fields = getAllFields();
    const form = getProfileForm(user, fields, isNewUser ? '/admin/users/new' : `/admin/users/edit/${user.id}`);
    const formData = await context.request.formData();
    const formFlash = createFormFlashSession(context.session);
    const result = validateForm(form, formData);
    console.log(result);

    if (!result.success) {
        await formFlash.set('newuser', formDataToRecord(formData));
        const errorMessage = createUserAlertMessageFromArray(form, result.errors);
        const alert = createAlert(alertType.error, errorMessage);
        await addAlertToSession(context.session, alert);

        let redirectUrl = `/admin/users/edit/${user.id}`;
        if (isNewUser) {
            redirectUrl = "/admin/users/new";
        }

        return context.redirect(redirectUrl);
    }

    const fname = getFieldByName(form, 'fname')?.value ?? user.fname;
    const lname = getFieldByName(form, 'lname')?.value ?? user.lname;
    const email = getFieldByName(form, 'email')?.value ?? user.email;
    const password = getFieldByName(form, 'new-password')?.value;
    const confirmPassword = getFieldByName(form, 'confirm-new-password')?.value;

    console.log(password);
    console.log(confirmPassword);
    console.log(isNewUser);

    if(isNewUser || (password || confirmPassword)) {
        if(isNewUser && !password) {
            await formFlash.set('newuser', formDataToRecord(formData));
            const alert = createAlert(alertType.error, "Password is required for new users.");
            await addAlertToSession(context.session, alert);
            return context.redirect("/admin/users/new");
        }
        if(password !== confirmPassword) {
            await formFlash.set('newuser', formDataToRecord(formData));
            const alert = createAlert(alertType.error, "New password and confirm password do not match.");
            await addAlertToSession(context.session, alert);

            let redirectUrl = `/admin/users/edit/${user.id}`;
            if (isNewUser) {
                redirectUrl = "/admin/users/new";
            }

            return context.redirect(redirectUrl);
        } else {
            user.password = await hash(password!);
        }
    }

    //check that email isnt used already by another user
    const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existingUser && existingUser.id !== user.id) {
        await formFlash.set('newuser', formDataToRecord(formData));
        const alert = createAlert(alertType.error, "Email is already in use by another account.");
        await addAlertToSession(context.session, alert);

        let redirectUrl = `/admin/users/edit/${user.id}`;
        if (isNewUser) {
            redirectUrl = "/admin/users/new";
        }

        return context.redirect(redirectUrl);
    }

    if(isNewUser) {
        user.email = email;
        user.fname = fname;
        user.lname = lname;
        user.password = await hash(password!);
        user.state = 1;

        await db.insert(users).values(user).returning();
    } else {
        await db.update(users).set({ fname, lname, email, password: user.password }).where(eq(users.id, user.id));
    }

    await formFlash.delete('newuser');
    let message = "User updated successfully.";
    if(isNewUser) {
        message = "User created successfully.";
    }

    const alert = createAlert(alertType.success, message);
    await addAlertToSession(context.session, alert);

    return context.redirect("/admin/users");
}
