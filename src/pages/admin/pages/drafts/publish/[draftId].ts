import externalPuckConfig from "virtual:purplepanda/puck-config";
import type { APIContext } from "astro";
import { eq } from 'drizzle-orm';
import * as z from "zod";
import { addAction } from "../../../../../actions/index.js";
import { addAlertToSession, alertType, createAlert } from "../../../../../alert/index.js";
import { getDb } from "../../../../../db/db.js";
import { dagNodes, pages } from "../../../../../db/schema.js";
import { runOverride } from "../../../../../hooks/index.js";
import { pageRootPropsSchema } from "../../../../../puck/page-root-schema.js";
import { contentValidationErrorsSchema, formatValidationErrors, validateContentTree } from "../../../../../puck/validate-content.js";

export async function POST(context: APIContext): Promise<Response> {
    const db = getDb();
    const { draftId } = context.params;

    const [draft] = await db.select().from(dagNodes).where(eq(dagNodes.id, draftId!)).limit(1);
    if (draft?.nodeType !== 'draft' || draft.entityType !== 'page') {
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

    const validationErrors = validateContentTree(externalPuckConfig ?? {}, parsedContent, { rootPropsSchema: pageRootPropsSchema });
    const overrideErrors = await runOverride("content:validate", { entity: "page", content: parsedContent }, contentValidationErrorsSchema);
    if (overrideErrors) validationErrors.push(...overrideErrors);
    if (validationErrors.length > 0) {
        const alert = createAlert(alertType.error, `Fix the following before publishing: ${formatValidationErrors(validationErrors)}`);
        await addAlertToSession(context.session, alert);
        return context.redirect(`/admin/pages/drafts/edit/${draftId}`);
    }

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
    await addAction(
        "page:publish",
        { id: page.id, draftId: draft.id, version: publishNode?.id ?? null },
        userId,
        {
            message: "Page {id} was published",
            placeholders: {
                id: { lookupColumn: pages.id, displayColumn: pages.content, displayPath: ["root", "props", "title"] },
            },
        },
    );

    const alert = createAlert(alertType.success, "Draft published successfully.");
    await addAlertToSession(context.session, alert);
    return context.redirect("/admin/pages");
}
