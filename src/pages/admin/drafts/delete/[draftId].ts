import type { APIContext } from "astro";
import { createAlert, alertType, addAlertToSession } from "../../../../alert/index.js";
import { getDb } from "../../../../db/db.js";
import { dagNodes } from "../../../../db/schema.js";
import { eq, inArray } from 'drizzle-orm';

export async function POST(context: APIContext): Promise<Response> {
    const db = getDb();
    const { draftId } = context.params;

    const [tip] = await db.select().from(dagNodes).where(eq(dagNodes.id, draftId!)).limit(1);
    if (!tip || tip.nodeType !== 'draft') {
        return new Response("Draft not found", { status: 404 });
    }

    // Walk the parent chain and collect all draft nodes in this branch
    const chainIds: string[] = [tip.id];
    let current = tip;
    while (current.parentId) {
        const [parent] = await db.select().from(dagNodes).where(eq(dagNodes.id, current.parentId)).limit(1);
        if (!parent || parent.nodeType !== 'draft') break;
        chainIds.push(parent.id);
        current = parent;
    }

    await db.update(dagNodes).set({ state: -1 }).where(inArray(dagNodes.id, chainIds));

    const redirectTo = tip.entityType === "page" ? "/admin/pages" : "/admin/templates";
    const alert = createAlert(alertType.success, "Draft deleted.");
    await addAlertToSession(context.session, alert);
    return context.redirect(redirectTo);
}
