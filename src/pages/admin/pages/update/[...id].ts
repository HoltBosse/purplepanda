import type { APIContext } from "astro";
import * as z from "zod";
import { addAlertToSession, alertType, createAlert } from "../../../../alert/index.js";
import { ContentValidationFailed, NotFoundError, savePage } from "../../../../services/content.js";

const contentSchema = z.string().refine((val) => {
    try {
        JSON.parse(val);
        return true;
    } catch (_e) {
        return false;
    }
}, "Content must be a valid JSON string");

export async function POST(context: APIContext): Promise<Response> {
    const pageId = context.params.id;
    const isNewPage = !pageId;
    const backTo = isNewPage ? "/admin/pages/new" : `/admin/pages/edit/${pageId}`;

    const formData = await context.request.formData();
    const contentResult = contentSchema.safeParse(formData.get("content"));
    if (!contentResult.success) {
        await addAlertToSession(context.session, createAlert(alertType.error, "Invalid content submitted"));
        return context.redirect(backTo);
    }

    // Pinned by the "Choose template"/"Blank" options on the pages list New button (see
    // index.astro, new.astro, PagePuckEditor's appendTemplateFields) — absent for the plain New
    // button, which leaves both at their defaults (inherit the resolved default template).
    const templateIdField = formData.get("templateId");
    const noTemplateField = formData.get("noTemplate");

    try {
        const { created } = await savePage({
            id: pageId,
            content: JSON.parse(contentResult.data),
            userId: (await context.session?.get("userId")) as string,
            // Commit (see PagePuckEditor's onCommit) submits the same form with an extra `state`
            // field so a brand-new page can be persisted without going live.
            state: formData.get("state") === "-1" ? 0 : 1,
            ...(typeof templateIdField === "string" ? { templateId: templateIdField } : {}),
            ...(typeof noTemplateField === "string" ? { noTemplate: noTemplateField === "true" } : {}),
        });
        await addAlertToSession(context.session, createAlert(alertType.success, created ? "Page created successfully." : "Page updated successfully."));
        return context.redirect("/admin/pages");
    } catch (error) {
        if (error instanceof NotFoundError) return new Response("Page not found", { status: 404 });
        if (error instanceof ContentValidationFailed) {
            await addAlertToSession(context.session, createAlert(alertType.error, `Fix the following before saving: ${error.message}`));
            return context.redirect(backTo);
        }
        throw error;
    }
}
