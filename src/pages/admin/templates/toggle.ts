import type { APIContext } from "astro";
import { eq } from "drizzle-orm";
import { addAlertToSession, alertType, createAlert } from "../../../alert/index.js";
import { getDb } from "../../../db/db.js";
import { templates } from "../../../db/schema.js";

export async function POST(context: APIContext): Promise<Response> {
    const db = getDb();
    const { id } = context.params;

    if (!id) {
        return new Response("Missing template id", { status: 400 });
    }

    const [template] = await db.select().from(templates).where(eq(templates.id, id)).limit(1);
    if (!template) {
        return new Response("Template not found", { status: 404 });
    }

    const newState = template.state === 1 ? 0 : 1;
    await db.update(templates).set({ state: newState }).where(eq(templates.id, id));

    const alert = createAlert(alertType.success, newState === 1 ? "Template enabled." : "Template disabled.");
    await addAlertToSession(context.session, alert);

    const referer = context.request.headers.get("referer");
    if (referer) {
        const refererUrl = new URL(referer);
        if (refererUrl.origin === context.url.origin) {
            return context.redirect(referer);
        }
    }

    return context.redirect("/admin/templates");
}
