import type { APIContext } from "astro";
import { createAlert, alertType, addAlertToSession } from "../../../alert/index.js";
import { validateForm, createUserAlertMessageFromArray, getFieldByName, formDataToRecord } from "../../../form/index.js";
import { createFormFlashSession } from "../../../form/session.js";
import { getAllFields } from "../../../form/index.js";
import { getDb } from "../../../db/db.js";
import { users } from "../../../db/schema.js";
import { eq } from "drizzle-orm";
import { get } from "node:http";

export async function POST(context: APIContext): Promise<Response> {
    const db = getDb();
    /* const userId = await context.session?.get('userId');
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    if (!user) {
        throw new Error('User not found');
    }

    const fields = getAllFields();
    const form = getProfileForm(user, fields, '/admin/profile/update');
    const formData = await context.request.formData();
    const formFlash = createFormFlashSession(context.session);
    const result = validateForm(form, formData);
    console.log(result);

    if (!result.success) {
        await formFlash.set('profile', formDataToRecord(formData));
        const errorMessage = createUserAlertMessageFromArray(form, result.errors);
        const alert = createAlert(alertType.error, errorMessage);
        await addAlertToSession(context.session, alert);
        return context.redirect("/admin/profile");
    }

    const fname = getFieldByName(form, 'fname')?.value ?? user.fname;
    const lname = getFieldByName(form, 'lname')?.value ?? user.lname;
    const email = getFieldByName(form, 'email')?.value ?? user.email;

    //check that email isnt used already by another user
    const [existingUser] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (existingUser && existingUser.id !== user.id) {
        await formFlash.set('profile', formDataToRecord(formData));
        const alert = createAlert(alertType.error, "Email is already in use by another account.");
        await addAlertToSession(context.session, alert);
        return context.redirect("/admin/profile");
    }

    //update fname/lname/email in db if it has changed
    await db.update(users).set({ fname, lname, email }).where(eq(users.id, user.id));

    await formFlash.delete('profile'); */
    const alert = createAlert(alertType.info, "An update happened (no)!");
    await addAlertToSession(context.session, alert);

    return context.redirect("/admin/settings");
}
