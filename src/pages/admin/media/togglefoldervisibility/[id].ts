import type { APIContext } from "astro";
import { createAlert, alertType, addAlertToSession } from "../../../../alert/index.js";
import { getDb } from "../../../../db/db.js";
import { mediafolders } from "../../../../db/schema.js";
import { eq } from "drizzle-orm";

export async function POST(context: APIContext): Promise<Response> {
    const db = getDb();
    const { id } = context.params;

    if (!id) {
        return new Response("Missing folder id", { status: 400 });
    }

    const [folder] = await db.select().from(mediafolders).where(eq(mediafolders.id, id)).limit(1);
    if (!folder) {
        return new Response("Folder not found", { status: 404 });
    }

    const newVisibility = folder.visibility === -1 ? 1 : -1;
    await db.update(mediafolders).set({ visibility: newVisibility }).where(eq(mediafolders.id, id));

    const alert = createAlert(alertType.success, newVisibility === -1 ? "Folder hidden." : "Folder visible.");
    await addAlertToSession(context.session, alert);

    const referer = context.request.headers.get("referer");
    if (referer) {
        const refererUrl = new URL(referer);
        if (refererUrl.origin === context.url.origin) {
            return context.redirect(referer);
        }
    }

    return context.redirect("/admin/media");
}
