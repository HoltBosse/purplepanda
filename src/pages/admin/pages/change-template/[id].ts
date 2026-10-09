import type { APIContext } from "astro";
import { addAlertToSession, alertType, createAlert } from "../../../../alert/index.js";
import { NotFoundError, setPageTemplate } from "../../../../services/content.js";

export async function POST(context: APIContext): Promise<Response> {
    const { id } = context.params;
    if (!id) {
        return new Response("Missing page id", { status: 400 });
    }

    const formData = await context.request.formData();
    const templateId = formData.get("templateId");
    if (typeof templateId !== "string" || !templateId) {
        await addAlertToSession(context.session, createAlert(alertType.error, "Select a template."));
        return context.redirect("/admin/pages");
    }

    try {
        await setPageTemplate({ pageId: id, templateId, userId: (await context.session?.get("userId")) as string });
    } catch (error) {
        if (!(error instanceof NotFoundError)) throw error;
        if (error.message === "Page not found") return new Response("Page not found", { status: 404 });
        await addAlertToSession(context.session, createAlert(alertType.error, "Template not found."));
        return context.redirect("/admin/pages");
    }

    await addAlertToSession(context.session, createAlert(alertType.success, "Template updated."));
    return context.redirect("/admin/pages");
}
