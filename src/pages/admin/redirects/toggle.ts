import type { APIContext } from "astro";
import { eq } from "drizzle-orm";
import { addAlertToSession, alertType, createAlert } from "../../../alert/index.js";
import { getDb } from "../../../db/db.js";
import { redirects } from "../../../db/schema.js";

export async function POST(context: APIContext): Promise<Response> {
    const db = getDb();
    const { id } = context.params;

    if (!id) {
        return new Response("Missing redirect id", { status: 400 });
    }

    const [redirect] = await db.select().from(redirects).where(eq(redirects.id, id)).limit(1);
    if (!redirect) {
        return new Response("Redirect not found", { status: 404 });
    }

    const newState = redirect.state === 1 ? 0 : 1;
    await db.update(redirects).set({ state: newState }).where(eq(redirects.id, id));

    const alert = createAlert(alertType.success, newState === 1 ? "Redirect enabled." : "Redirect disabled.");
    await addAlertToSession(context.session, alert);

    const referer = context.request.headers.get("referer");
    if (referer) {
        const refererUrl = new URL(referer);
        if (refererUrl.origin === context.url.origin) {
            return context.redirect(referer);
        }
    }

    return context.redirect("/admin/redirects");
}
