import type { APIContext } from "astro";
import { createAlert, alertType, addAlertToSession } from "../../../alert/index.js";
import { getDb } from "../../../db/db.js";
import { users } from "../../../db/schema.js";
import { eq } from "drizzle-orm";

export async function POST(context: APIContext): Promise<Response> {
    const db = getDb();
    const { id } = context.params;

    if (!id) {
        return new Response("Missing user id", { status: 400 });
    }

    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!user) {
        return new Response("User not found", { status: 404 });
    }

    const newState = user.state === 1 ? 0 : 1;
    await db.update(users).set({ state: newState }).where(eq(users.id, id));

    const alert = createAlert(alertType.success, newState === 1 ? "User enabled." : "User disabled.");
    await addAlertToSession(context.session, alert);

    const referer = context.request.headers.get("referer");
    if (referer) {
        const refererUrl = new URL(referer);
        if (refererUrl.origin === context.url.origin) {
            return context.redirect(referer);
        }
    }

    return context.redirect("/admin/users");
}
