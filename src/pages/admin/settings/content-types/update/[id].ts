import type { APIContext } from "astro";
import { addAlertToSession, alertType, createAlert } from "../../../../../alert/index.js";
import { addAction } from "../../../../../audit/index.js";
import { findBaseUrlConflict, updateContentType } from "../../../../../db/content-types.js";
import { getDb } from "../../../../../db/db.js";
import { contentTypes } from "../../../../../db/schema.js";
import { formDataToRecord } from "../../../../../form/index.js";
import { contentTypeFormSchema, contentTypeIdSchema, formatIssues, SETTINGS_REDIRECT } from "../_form.js";

// Saves an edit made in the content type builder in /admin/settings. Posts the same form as
// ../create.ts, against the content type named in the URL.
export async function POST(context: APIContext): Promise<Response> {
    const db = getDb();
    const idResult = contentTypeIdSchema.safeParse(context.params.id);
    if (!idResult.success) {
        return new Response("Content type not found", { status: 404 });
    }
    const id = idResult.data;

    const formData = await context.request.formData();
    const result = contentTypeFormSchema.safeParse(formDataToRecord(formData));

    if (!result.success) {
        await addAlertToSession(context.session, createAlert(alertType.error, formatIssues(result.error)));
        return context.redirect(SETTINGS_REDIRECT);
    }

    const conflict = await findBaseUrlConflict(db, result.data.baseUrl, id);
    if (conflict) {
        const alert = createAlert(alertType.error, `"${conflict.title}" already publishes under that base URL.`);
        await addAlertToSession(context.session, alert);
        return context.redirect(SETTINGS_REDIRECT);
    }

    const updated = await updateContentType(db, id, result.data);
    if (!updated) {
        await addAlertToSession(context.session, createAlert(alertType.error, "Content type not found."));
        return context.redirect(SETTINGS_REDIRECT);
    }

    const userId = await context.session?.get("userId");
    await addAction("content-type:update", { id }, userId, {
        message: "Content type {id} was updated",
        placeholders: { id: { lookupColumn: contentTypes.id, displayColumn: contentTypes.title } },
    });

    const alert = createAlert(alertType.success, `Content type "${updated.title}" updated successfully.`);
    await addAlertToSession(context.session, alert);
    return context.redirect(SETTINGS_REDIRECT);
}
