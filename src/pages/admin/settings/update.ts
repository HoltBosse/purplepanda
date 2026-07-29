import type { APIContext } from "astro";
import { createAlert, alertType, addAlertToSession } from "../../../alert/index.js";
import { validateForm, createUserAlertMessageFromArray, getFieldByName, formDataToRecord } from "../../../form/index.js";
import { createFormFlashSession } from "../../../form/session.js";
import { getSettingsForm } from "./form.js";
import { getDb } from "../../../db/db.js";
import { settings } from "../../../db/schema.js";

export async function POST(context: APIContext): Promise<Response> {
    const db = getDb();
    const form = getSettingsForm();
    const formData = await context.request.formData();
    const formFlash = createFormFlashSession(context.session);
    const result = validateForm(form, formData);

    if (!result.success) {
        await formFlash.set('settings', formDataToRecord(formData));
        const errorMessage = createUserAlertMessageFromArray(form, result.errors);
        const alert = createAlert(alertType.error, errorMessage);
        await addAlertToSession(context.session, alert);
        return context.redirect("/admin/settings");
    }

    const defaultTemplateId = getFieldByName(form, 'dt-option')?.value;
    const turnstileSiteKey = getFieldByName(form, 'turnstile-site-key')?.value ?? '';
    const turnstileSecretKey = getFieldByName(form, 'turnstile-secret-key')?.value ?? '';

    await db
        .insert(settings)
        .values({ key: 'default_template', value: defaultTemplateId })
        .onConflictDoUpdate({ target: settings.key, set: { value: defaultTemplateId } });

    await db
        .insert(settings)
        .values({ key: 'turnstile_site_key', value: turnstileSiteKey })
        .onConflictDoUpdate({ target: settings.key, set: { value: turnstileSiteKey } });

    await db
        .insert(settings)
        .values({ key: 'turnstile_secret_key', value: turnstileSecretKey })
        .onConflictDoUpdate({ target: settings.key, set: { value: turnstileSecretKey } });

    await formFlash.delete('settings');
    const alert = createAlert(alertType.success, "Settings updated successfully.");
    await addAlertToSession(context.session, alert);

    return context.redirect("/admin/settings");
}
