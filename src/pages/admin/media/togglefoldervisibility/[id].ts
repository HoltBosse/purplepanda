import type { APIContext } from "astro";
import { eq } from "drizzle-orm";
import { addAlertToSession, alertType, createAlert } from "../../../../alert/index.js";
import { getDb } from "../../../../db/db.js";
import { mediafolders } from "../../../../db/schema.js";
import { sameOriginReferer } from "../../../../http/referer.js";

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

    const back = sameOriginReferer(context);
    if (back) {
        return context.redirect(back);
    }

    return context.redirect("/admin/media");
}
