import externalPuckConfig from "virtual:purplepanda/puck-config";
import type { APIContext } from "astro";
import { addAlertToSession, alertType, createAlert } from "../../../alert/index.js";
import { getDb } from "../../../db/db.js";
import { settings } from "../../../db/schema.js";
import { createUserAlertMessageFromArray, formDataToRecord, getFieldByName, validateForm } from "../../../form/index.js";
import { createFormFlashSession } from "../../../form/session.js";
import { getSettingsForm } from "./form.js";

export async function POST(context: APIContext): Promise<Response> {
    const db = getDb();
    const contentTypes = externalPuckConfig?.contentTypes ?? [];
    const form = getSettingsForm(undefined, undefined, undefined, {}, contentTypes);
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

    const siteName = getFieldByName(form, 'site-name')?.value ?? '';
    const defaultTemplateId = getFieldByName(form, 'dt-option')?.value;
    const turnstileSiteKey = getFieldByName(form, 'turnstile-site-key')?.value ?? '';
    const turnstileSecretKey = getFieldByName(form, 'turnstile-secret-key')?.value ?? '';
    const headingFontLink = getFieldByName(form, 'heading-font')?.value ?? '';
    const bodyFontLink = getFieldByName(form, 'body-font')?.value ?? '';

    await db
        .insert(settings)
        .values({ key: 'site_name', value: siteName })
        .onConflictDoUpdate({ target: settings.key, set: { value: siteName } });

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

    await db
        .insert(settings)
        .values({ key: 'heading_font_link', value: headingFontLink })
        .onConflictDoUpdate({ target: settings.key, set: { value: headingFontLink } });

    await db
        .insert(settings)
        .values({ key: 'body_font_link', value: bodyFontLink })
        .onConflictDoUpdate({ target: settings.key, set: { value: bodyFontLink } });

    for (const contentType of contentTypes) {
        const templateFormKey = `content-default-template-${contentType.id}`;
        const templateSettingKey = `content_default_template_${contentType.id}`;
        const templateValue = getFieldByName(form, templateFormKey)?.value ?? '';

        await db
            .insert(settings)
            .values({ key: templateSettingKey, value: templateValue })
            .onConflictDoUpdate({ target: settings.key, set: { value: templateValue } });
    }

    await formFlash.delete('settings');
    const alert = createAlert(alertType.success, "Settings updated successfully.");
    await addAlertToSession(context.session, alert);

    return context.redirect("/admin/settings");
}
