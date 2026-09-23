import type { APIContext } from "astro";
import { eq } from "drizzle-orm";
import { addAlertToSession, alertType, createAlert } from "../../../../../alert/index.js";
import { invalidatePagesCache } from "../../../../../db/content-cache.js";
import { getContentTypeById } from "../../../../../db/content-types.js";
import { getDb } from "../../../../../db/db.js";
import { pages } from "../../../../../db/schema.js";

export async function POST(context: APIContext): Promise<Response> {
    const db = getDb();
    const { typeId, id } = context.params;

    if (!id) {
        return new Response("Missing content id", { status: 400 });
    }

    if (!typeId) {
        return new Response("Missing content type id", { status: 400 });
    }

    if (!(await getContentTypeById(db, typeId))) {
        return new Response("Content type not found", { status: 404 });
    }

    const [page] = await db.select().from(pages).where(eq(pages.id, id)).limit(1);
    if (!page) {
        return new Response("Content not found", { status: 404 });
    }

    const newState = page.state === 1 ? 0 : 1;
    await db.update(pages).set({ state: newState }).where(eq(pages.id, id));
    invalidatePagesCache(db);

    const alert = createAlert(alertType.success, newState === 1 ? "Content enabled." : "Content disabled.");
    await addAlertToSession(context.session, alert);

    const referer = context.request.headers.get("referer");
    if (referer) {
        const refererUrl = new URL(referer);
        if (refererUrl.origin === context.url.origin) {
            return context.redirect(referer);
        }
    }

    return context.redirect(`/admin/content/${typeId}`);
}
