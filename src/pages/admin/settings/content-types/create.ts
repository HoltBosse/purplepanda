import type { APIContext } from "astro";
import { addAlertToSession, alertType, createAlert } from "../../../../alert/index.js";
import { addAction } from "../../../../audit/index.js";
import { createContentType, findBaseUrlConflict } from "../../../../db/content-types.js";
import { getDb } from "../../../../db/db.js";
import { contentTypes } from "../../../../db/schema.js";
import { formDataToRecord } from "../../../../form/index.js";
import { contentTypeFormSchema, formatIssues, SETTINGS_REDIRECT } from "./_form.js";

// Creates a content type from the builder in /admin/settings (components/ContentTypeManager.tsx).
export async function POST(context: APIContext): Promise<Response> {
    const db = getDb();
    const formData = await context.request.formData();
    const result = contentTypeFormSchema.safeParse(formDataToRecord(formData));

    if (!result.success) {
        await addAlertToSession(context.session, createAlert(alertType.error, formatIssues(result.error)));
        return context.redirect(SETTINGS_REDIRECT);
    }

    const conflict = await findBaseUrlConflict(db, result.data.baseUrl);
    if (conflict) {
        const alert = createAlert(alertType.error, `"${conflict.title}" already publishes under that base URL.`);
        await addAlertToSession(context.session, alert);
        return context.redirect(SETTINGS_REDIRECT);
    }

    const created = await createContentType(db, result.data);

    const userId = await context.session?.get("userId");
    await addAction("content-type:create", { id: created.id }, userId, {
        message: "Content type {id} was created",
        placeholders: { id: { lookupColumn: contentTypes.id, displayColumn: contentTypes.title } },
    });

    const alert = createAlert(alertType.success, `Content type "${created.title}" created successfully.`);
    await addAlertToSession(context.session, alert);
    return context.redirect(SETTINGS_REDIRECT);
}
