import type { APIContext } from "astro";
import * as z from "zod";
import { addAlertToSession, alertType, createAlert } from "../../../../alert/index.js";
import { ContentValidationFailed, NotFoundError, saveTemplate } from "../../../../services/content.js";

const contentSchema = z.string().refine((val) => {
    try {
        JSON.parse(val);
        return true;
    } catch (_e) {
        return false;
    }
}, "Content must be a valid JSON string");

export async function POST(context: APIContext): Promise<Response> {
    const templateId = context.params.id;
    const isNewTemplate = !templateId;
    const backTo = isNewTemplate ? "/admin/templates/new" : `/admin/templates/edit/${templateId}`;

    const formData = await context.request.formData();
    const contentResult = contentSchema.safeParse(formData.get("content"));
    if (!contentResult.success) {
        await addAlertToSession(context.session, createAlert(alertType.error, "Invalid content Submitted"));
        return context.redirect(backTo);
    }

    try {
        const { created } = await saveTemplate({
            id: templateId,
            content: JSON.parse(contentResult.data),
            userId: (await context.session?.get("userId")) as string,
        });
        await addAlertToSession(context.session, createAlert(alertType.success, created ? "Template created successfully." : "Template updated successfully."));
        return context.redirect("/admin/templates");
    } catch (error) {
        if (error instanceof NotFoundError) return new Response("Template not found", { status: 404 });
        if (error instanceof ContentValidationFailed) {
            await addAlertToSession(context.session, createAlert(alertType.error, `Fix the following before saving: ${error.message}`));
            return context.redirect(backTo);
        }
        throw error;
    }
}
