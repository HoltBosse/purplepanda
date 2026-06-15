import type { APIContext } from "astro";
import { createAlert, alertType, addAlertToSession } from "../../../alert/index.js";
import { getDb } from "../../../db/db.js";
import { forms } from "../../../db/schema.js";
import { eq } from "drizzle-orm";

export async function POST(context: APIContext): Promise<Response> {
    const db = getDb();
    const { id } = context.params;

    if (!id) {
        return new Response("Missing form id", { status: 400 });
    }

    const [form] = await db.select().from(forms).where(eq(forms.id, id)).limit(1);
    if (!form) {
        return new Response("Form not found", { status: 404 });
    }

    const newState = form.state === 1 ? 0 : 1;
    await db.update(forms).set({ state: newState }).where(eq(forms.id, id));

    const alert = createAlert(alertType.success, newState === 1 ? "Form enabled." : "Form disabled.");
    await addAlertToSession(context.session, alert);

    const referer = context.request.headers.get("referer");
    if (referer) {
        const refererUrl = new URL(referer);
        if (refererUrl.origin === context.url.origin) {
            return context.redirect(referer);
        }
    }

    return context.redirect("/admin/forms");
}
