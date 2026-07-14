import type { APIContext } from "astro";
import { createAlert, alertType, addAlertToSession } from "../../../../../alert/index.js";
import { getDb } from "../../../../../db/db.js";
import { pages, dagNodes } from "../../../../../db/schema.js";
import { eq } from 'drizzle-orm';
import * as z from "zod";
import { addAction } from "../../../../../actions/index.js";

export async function POST(context: APIContext): Promise<Response> {
    const db = getDb();
    const { draftId } = context.params;

    const [draft] = await db.select().from(dagNodes).where(eq(dagNodes.id, draftId!)).limit(1);
    if (!draft || draft.nodeType !== 'draft' || draft.entityType !== 'page') {
        return new Response("Draft not found", { status: 404 });
    }

    const [page] = await db.select().from(pages).where(eq(pages.id, draft.entityId)).limit(1);
    if (!page) {
        return new Response("Page not found", { status: 404 });
    }

    const formData = await context.request.formData();
    const contentField = formData.get("content");
    const contentSchema = z.string().refine((val) => {
        try { JSON.parse(val); return true; } catch { return false; }
    }, "Content must be a valid JSON string");
    const contentResult = contentSchema.safeParse(contentField);

    if (!contentResult.success) {
        const alert = createAlert(alertType.error, "Invalid content submitted.");
        await addAlertToSession(context.session, alert);
        return context.redirect(`/admin/pages/drafts/edit/${draftId}`);
    }

    const parsedContent = JSON.parse(contentResult.data);

    // Publishing a draft always makes it the new default, overwriting whatever is
    // currently live rather than attempting to merge with changes made to the main
    // branch since the draft was created.
    await db.update(pages).set({ content: parsedContent }).where(eq(pages.id, page.id));

    // Mark the draft as merged so it drops out of the active drafts list, then log a
    // publish node whose parent is the draft tip -- this is what lets HistoryView draw
    // the merge-back edge from the draft branch into the main lane.
    await db.update(dagNodes).set({ state: 0 }).where(eq(dagNodes.id, draft.id));

    const [publishNode] = await db.insert(dagNodes).values({
        entityType: 'page',
        entityId: page.id,
        parentId: draft.id,
        content: parsedContent,
        nodeType: 'publish',
    }).returning();

    const userId = await context.session?.get("userId");
    await addAction("pagepublish", { id: page.id, draftId: draft.id, version: publishNode?.id ?? null }, userId);

    const alert = createAlert(alertType.success, "Draft published successfully.");
    await addAlertToSession(context.session, alert);
    return context.redirect("/admin/pages");
}
