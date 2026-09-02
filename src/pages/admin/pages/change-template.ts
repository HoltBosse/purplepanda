import type { APIContext } from "astro";
import { and, eq } from "drizzle-orm";
import { addAlertToSession, alertType, createAlert } from "../../../alert/index.js";
import { getDb } from "../../../db/db.js";
import { pages, templates } from "../../../db/schema.js";

export async function POST(context: APIContext): Promise<Response> {
    const db = getDb();
    const { id } = context.params;

    if (!id) {
        return new Response("Missing page id", { status: 400 });
    }

    const [page] = await db.select({ id: pages.id }).from(pages).where(eq(pages.id, id)).limit(1);
    if (!page) {
        return new Response("Page not found", { status: 404 });
    }

    const formData = await context.request.formData();
    const templateId = formData.get("templateId");

    if (typeof templateId !== "string" || !templateId) {
        const alert = createAlert(alertType.error, "Select a template.");
        await addAlertToSession(context.session, alert);
        return context.redirect("/admin/pages");
    }

    const [template] = await db
        .select({ id: templates.id })
        .from(templates)
        .where(and(eq(templates.id, templateId), eq(templates.state, 1)))
        .limit(1);
    if (!template) {
        const alert = createAlert(alertType.error, "Template not found.");
        await addAlertToSession(context.session, alert);
        return context.redirect("/admin/pages");
    }

    // A specific template is now pinned, so any earlier "no template" choice no longer applies.
    await db.update(pages).set({ templateId, noTemplate: false }).where(eq(pages.id, id));

    const alert = createAlert(alertType.success, "Template updated.");
    await addAlertToSession(context.session, alert);

    return context.redirect("/admin/pages");
}
