import type { APIContext } from "astro";
import { addAlertToSession, alertType, createAlert } from "../../../alert/index.js";
import { invalidateSettingsCache } from "../../../db/content-cache.js";
import { listContentTypes } from "../../../db/content-types.js";
import { getDb } from "../../../db/db.js";
import { settings, settingsKeyTarget } from "../../../db/schema.js";
import { createUserAlertMessageFromArray, formDataToRecord, getFieldByName, validateForm } from "../../../form/index.js";
import { createFormFlashSession } from "../../../form/session.js";
import { componentSettingsKey, componentsWithSiteSettings } from "../../../puck/component-settings.js";
import { getStoredComponentSettings } from "../../../puck/component-settings.server.js";
import { getDisabledComponents } from "../../../puck/site-components.server.js";
import externalPuckConfig from "../../../puck.config.js";
import { componentSecretFieldNames, getComponentSettingsGroups, readComponentSettingsForm } from "./_component-settings.js";
import { getSettingsForm } from "./_form.js";

export async function POST(context: APIContext): Promise<Response> {
    const db = getDb();
    const contentTypes = await listContentTypes(db);
    // Only the components this site can use: a disabled one's settings are left as they are.
    const settingsComponents = componentsWithSiteSettings(externalPuckConfig ?? {}, await getDisabledComponents());
    const storedComponentSettings = await getStoredComponentSettings(settingsComponents);
    const form = await getSettingsForm(
        undefined,
        {},
        contentTypes,
        getComponentSettingsGroups(settingsComponents, storedComponentSettings),
    );
    const formData = await context.request.formData();
    const formFlash = createFormFlashSession(context.session);
    const result = validateForm(form, formData);

    if (!result.success) {
        const flashValues = formDataToRecord(formData);
        // Secrets aren't kept in the session; the form never shows them again anyway.
        for (const name of componentSecretFieldNames(settingsComponents)) delete flashValues[name];
        await formFlash.set('settings', flashValues);
        const errorMessage = createUserAlertMessageFromArray(form, result.errors);
        const alert = createAlert(alertType.error, errorMessage);
        await addAlertToSession(context.session, alert);
        return context.redirect("/admin/settings");
    }

    const siteName = getFieldByName(form, 'site-name')?.value ?? '';
    const defaultTemplateId = getFieldByName(form, 'dt-option')?.value;
    const headingFontLink = getFieldByName(form, 'heading-font')?.value ?? '';
    const bodyFontLink = getFieldByName(form, 'body-font')?.value ?? '';
    const emailHost = getFieldByName(form, 'email-host')?.value ?? '';
    const emailAddress = getFieldByName(form, 'email-address')?.value ?? '';
    const emailPassword = getFieldByName(form, 'email-password')?.value ?? '';

    await db
        .insert(settings)
        .values({ key: 'site_name', value: siteName })
        .onConflictDoUpdate({ target: settingsKeyTarget, set: { value: siteName } });

    await db
        .insert(settings)
        .values({ key: 'default_template', value: defaultTemplateId })
        .onConflictDoUpdate({ target: settingsKeyTarget, set: { value: defaultTemplateId } });

    await db
        .insert(settings)
        .values({ key: 'heading_font_link', value: headingFontLink })
        .onConflictDoUpdate({ target: settingsKeyTarget, set: { value: headingFontLink } });

    await db
        .insert(settings)
        .values({ key: 'body_font_link', value: bodyFontLink })
        .onConflictDoUpdate({ target: settingsKeyTarget, set: { value: bodyFontLink } });

    await db
        .insert(settings)
        .values({ key: 'email_host', value: emailHost })
        .onConflictDoUpdate({ target: settingsKeyTarget, set: { value: emailHost } });

    await db
        .insert(settings)
        .values({ key: 'email_address', value: emailAddress })
        .onConflictDoUpdate({ target: settingsKeyTarget, set: { value: emailAddress } });

    await db
        .insert(settings)
        .values({ key: 'email_password', value: emailPassword })
        .onConflictDoUpdate({ target: settingsKeyTarget, set: { value: emailPassword } });

    for (const contentType of contentTypes) {
        const templateFormKey = `content-default-template-${contentType.id}`;
        const templateSettingKey = `content_default_template_${contentType.id}`;
        const templateValue = getFieldByName(form, templateFormKey)?.value ?? '';

        await db
            .insert(settings)
            .values({ key: templateSettingKey, value: templateValue })
            .onConflictDoUpdate({ target: settingsKeyTarget, set: { value: templateValue } });
    }

    for (const [name, value] of readComponentSettingsForm(form, settingsComponents, storedComponentSettings)) {
        await db
            .insert(settings)
            .values({ key: componentSettingsKey(name), value })
            .onConflictDoUpdate({ target: settingsKeyTarget, set: { value } });
    }

    invalidateSettingsCache(db);

    await formFlash.delete('settings');
    const alert = createAlert(alertType.success, "Settings updated successfully.");
    await addAlertToSession(context.session, alert);

    return context.redirect("/admin/settings");
}
