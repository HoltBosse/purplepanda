import type { APIContext } from "astro";
import { createAlert, alertType, addAlertToSession } from "../../../alert/index.js";
import { getDb } from "../../../db/db.js";
import { tags } from "../../../db/schema.js";
import { eq } from "drizzle-orm";

export async function POST(context: APIContext): Promise<Response> {
    const db = getDb();
    const { id } = context.params;

    if (!id) {
        return new Response("Missing tag id", { status: 400 });
    }

    const [tag] = await db.select().from(tags).where(eq(tags.id, id)).limit(1);
    if (!tag) {
        return new Response("Tag not found", { status: 404 });
    }

    const newState = tag.state === 1 ? 0 : 1;
    await db.update(tags).set({ state: newState }).where(eq(tags.id, id));

    const alert = createAlert(alertType.success, newState === 1 ? "Tag enabled." : "Tag disabled.");
    await addAlertToSession(context.session, alert);

    const referer = context.request.headers.get("referer");
    if (referer) {
        const refererUrl = new URL(referer);
        if (refererUrl.origin === context.url.origin) {
            return context.redirect(referer);
        }
    }

    return context.redirect("/admin/tags");
}
