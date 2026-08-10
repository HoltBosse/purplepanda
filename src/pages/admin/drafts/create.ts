import type { APIContext } from "astro";
import { createAlert, alertType, addAlertToSession } from "../../../alert/index.js";
import { getDb } from "../../../db/db.js";
import { pages, templates, dagNodes } from "../../../db/schema.js";
import { eq, and, desc, count, gt } from 'drizzle-orm';
import * as z from "zod";
import { MAX_DRAFTS_PER_ENTITY } from "../../../dag/index.js";

const schema = z.object({
    entityType: z.enum(["page", "template", "content"]),
    entityId: z.uuid(),
    name: z.string().min(1).max(20),
    // When set, the draft branches off this specific dagNode (its content and
    // lineage) instead of the entity's current live content / latest publish.
    sourceNodeId: z.uuid().optional(),
});

export async function POST(context: APIContext): Promise<Response> {
    const db = getDb();
    const formData = await context.request.formData();

    const result = schema.safeParse({
        entityType: formData.get("entityType"),
        entityId: formData.get("entityId"),
        name: formData.get("name"),
        sourceNodeId: formData.get("sourceNodeId") || undefined,
    });

    if (!result.success) {
        const alert = createAlert(alertType.error, "Invalid draft parameters.");
        await addAlertToSession(context.session, alert);
        return context.redirect("/admin/pages");
    }

    const { entityType, entityId, name, sourceNodeId } = result.data;

    let redirectBack: string;
    let draftEditBase: string;
    let content: unknown;

    if (entityType === "page" || entityType === "content") {
        const [entity] = await db.select().from(pages).where(eq(pages.id, entityId)).limit(1);
        if (!entity) {
            const alert = createAlert(alertType.error, entityType === "page" ? "Page not found." : "Content not found.");
            await addAlertToSession(context.session, alert);
            return context.redirect(entityType === "page" ? "/admin/pages" : "/admin/content");
        }
        content = entity.content;
        redirectBack = entityType === "page" ? "/admin/pages" : `/admin/content/${entity.contentType}`;
        draftEditBase = entityType === "page" ? "/admin/pages" : "/admin/content";
    } else {
        const [entity] = await db.select().from(templates).where(eq(templates.id, entityId)).limit(1);
        if (!entity) {
            const alert = createAlert(alertType.error, "Template not found.");
            await addAlertToSession(context.session, alert);
            return context.redirect("/admin/templates");
        }
        content = entity.content;
        redirectBack = "/admin/templates";
        draftEditBase = "/admin/templates";
    }

    const activeDraftCount = await db
        .select({ count: count() })
        .from(dagNodes)
        .where(and(
            eq(dagNodes.entityType, entityType),
            eq(dagNodes.entityId, entityId),
            eq(dagNodes.nodeType, 'draft'),
            eq(dagNodes.state, 1),
        ))
        .then(rows => rows[0]?.count ?? 0);

    if (activeDraftCount >= MAX_DRAFTS_PER_ENTITY) {
        const alert = createAlert(alertType.error, `Draft limit reached (max ${MAX_DRAFTS_PER_ENTITY}). Delete an existing draft first.`);
        await addAlertToSession(context.session, alert);
        return context.redirect(redirectBack);
    }

    let parentId: string | null;

    if (sourceNodeId) {
        const [sourceNode] = await db
            .select()
            .from(dagNodes)
            .where(and(
                eq(dagNodes.id, sourceNodeId),
                eq(dagNodes.entityType, entityType),
                eq(dagNodes.entityId, entityId),
                gt(dagNodes.state, -1),
            ))
            .limit(1);

        if (!sourceNode) {
            const alert = createAlert(alertType.error, "Source version not found.");
            await addAlertToSession(context.session, alert);
            return context.redirect(redirectBack);
        }

        content = sourceNode.content;
        parentId = sourceNode.id;
    } else {
        const [latestPublishNode] = await db
            .select()
            .from(dagNodes)
            .where(and(eq(dagNodes.entityType, entityType), eq(dagNodes.entityId, entityId), eq(dagNodes.nodeType, 'publish')))
            .orderBy(desc(dagNodes.createdAt))
            .limit(1);
        parentId = latestPublishNode?.id ?? null;
    }

    const inserted = await db.insert(dagNodes).values({
        entityType,
        entityId,
        parentId,
        content: content as any,
        nodeType: 'draft',
        name,
    }).returning();

    const newDraft = inserted[0];
    if (!newDraft) {
        const alert = createAlert(alertType.error, "Failed to create draft.");
        await addAlertToSession(context.session, alert);
        return context.redirect(redirectBack);
    }

    return context.redirect(`${draftEditBase}/drafts/edit/${newDraft.id}`);
}
