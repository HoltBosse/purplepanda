import type { APIContext } from "astro";
import { eq } from 'drizzle-orm';
import * as z from "zod";
import { addAlertToSession, alertType, createAlert } from "../../../../../alert/index.js";
import { getDb } from "../../../../../db/db.js";
import { dagNodes } from "../../../../../db/schema.js";

export async function POST(context: APIContext): Promise<Response> {
    const db = getDb();
    const { draftId } = context.params;

    const [draft] = await db.select().from(dagNodes).where(eq(dagNodes.id, draftId!)).limit(1);
    if (draft?.nodeType !== 'draft' || draft.entityType !== 'page') {
        return new Response("Draft not found", { status: 404 });
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

    // Mark current draft as superseded (state=0), then create new node as tip
    await db.update(dagNodes).set({ state: 0 }).where(eq(dagNodes.id, draft.id));

    const [newDraft] = await db.insert(dagNodes).values({
        entityType: draft.entityType,
        entityId: draft.entityId,
        parentId: draft.id,
        content: JSON.parse(contentResult.data),
        nodeType: 'draft',
        name: draft.name,
        state: 1,
    }).returning();

    if (!newDraft) {
        const alert = createAlert(alertType.error, "Failed to save draft.");
        await addAlertToSession(context.session, alert);
        return context.redirect(`/admin/pages/drafts/edit/${draftId}`);
    }

    const alert = createAlert(alertType.success, "Draft saved successfully.");
    await addAlertToSession(context.session, alert);
    return context.redirect("/admin/pages");
}
