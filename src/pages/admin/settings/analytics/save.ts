import type { APIContext } from "astro";
import { addAlertToSession, alertType, createAlert } from "../../../../alert/index.js";
import { ANALYTICS_SETTING_KEY, analyticsProviders, readAnalyticsForm } from "../../../../analytics/index.js";
import { addAction } from "../../../../audit/index.js";
import { invalidateSettingsCache } from "../../../../db/content-cache.js";
import { getDb } from "../../../../db/db.js";
import { settings } from "../../../../db/schema.js";
import { upsertSetting } from "../../../../db/settings.js";
import { formDataToRecord } from "../../../../form/index.js";
import { createFormFlashSession } from "../../../../form/session.js";

const ANALYTICS_PATH = "/admin/settings/analytics";

// Saves the analytics screen. Every provider is saved at once; a validation error in any of them
// saves nothing and sends the submitted values back to the form.
export async function POST(context: APIContext): Promise<Response> {
    const db = getDb();
    const formData = await context.request.formData();
    const formFlash = createFormFlashSession(context.session);
    const { settings: analytics, errors } = readAnalyticsForm(formData);

    if (errors.length > 0) {
        await formFlash.set("analytics", formDataToRecord(formData));
        await addAlertToSession(context.session, createAlert(alertType.error, errors.join(" ")));
        return context.redirect(ANALYTICS_PATH);
    }

    const row = await upsertSetting(db, ANALYTICS_SETTING_KEY, analytics);
    invalidateSettingsCache(db);
    await formFlash.delete("analytics");

    const enabled = analyticsProviders.filter((provider) => analytics[provider.id]?.enabled).map((provider) => provider.id);
    const userId = await context.session?.get("userId");
    if (row) {
        await addAction("analytics:update", { id: row.id, enabled }, userId, {
            message: "Analytics settings were updated",
            placeholders: { id: { lookupColumn: settings.id, displayColumn: settings.key } },
        });
    }

    await addAlertToSession(context.session, createAlert(alertType.success, "Analytics settings saved."));
    return context.redirect(ANALYTICS_PATH);
}
