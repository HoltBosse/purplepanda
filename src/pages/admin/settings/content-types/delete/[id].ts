import type { APIContext } from "astro";
import { addAlertToSession, alertType, createAlert } from "../../../../../alert/index.js";
import { addAction } from "../../../../../audit/index.js";
import { deleteContentType, getContentTypeById } from "../../../../../db/content-types.js";
import { getDb } from "../../../../../db/db.js";
import { contentTypes } from "../../../../../db/schema.js";
import { contentTypeIdSchema, SETTINGS_REDIRECT } from "../_form.js";

// Deletes a content type from /admin/settings. A soft delete (see deleteContentType): its items
// stay in the database but stop showing anywhere — admin, public routes, sitemap, pickers.
export async function POST(context: APIContext): Promise<Response> {
    const db = getDb();
    const idResult = contentTypeIdSchema.safeParse(context.params.id);
    if (!idResult.success) {
        return new Response("Content type not found", { status: 404 });
    }
    const id = idResult.data;

    // Read before deleting — once it's gone, the live list this looks in no longer has it.
    const existing = await getContentTypeById(db, id);
    const deleted = existing ? await deleteContentType(db, id) : false;

    if (!existing || !deleted) {
        await addAlertToSession(context.session, createAlert(alertType.error, "Content type not found."));
        return context.redirect(SETTINGS_REDIRECT);
    }

    const userId = await context.session?.get("userId");
    await addAction("content-type:delete", { id }, userId, {
        message: "Content type {id} was deleted",
        placeholders: { id: { lookupColumn: contentTypes.id, displayColumn: contentTypes.title } },
    });

    const alert = createAlert(alertType.success, `Content type "${existing.title}" deleted.`);
    await addAlertToSession(context.session, alert);
    return context.redirect(SETTINGS_REDIRECT);
}
