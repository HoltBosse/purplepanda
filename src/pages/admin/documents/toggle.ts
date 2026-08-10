import type { APIContext } from "astro";
import { eq } from "drizzle-orm";
import { addAlertToSession, alertType, createAlert } from "../../../alert/index.js";
import { getDb } from "../../../db/db.js";
import { documents } from "../../../db/schema.js";

export async function POST(context: APIContext): Promise<Response> {
    const { id } = context.params;
    if (!id) return context.redirect("/admin/documents");

    const db = getDb();
    const [doc] = await db.select({ state: documents.state }).from(documents).where(eq(documents.id, id)).limit(1);

    if (!doc) {
        const alert = createAlert(alertType.error, "Document not found.");
        await addAlertToSession(context.session, alert);
        return context.redirect("/admin/documents");
    }

    await db.update(documents).set({ state: doc.state === 1 ? 0 : 1 }).where(eq(documents.id, id));

    return context.redirect("/admin/documents");
}
