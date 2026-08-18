import externalPuckConfig from "virtual:purplepanda/puck-config";
import type { APIContext } from "astro";
import { and, desc, eq, getTableColumns, type InferSelectModel } from 'drizzle-orm';
import * as z from "zod";
import { addAction } from "../../../actions/index.js";
import { addAlertToSession, alertType, createAlert } from "../../../alert/index.js";
import { getDb } from "../../../db/db.js";
import { dagNodes, pages } from "../../../db/schema.js";
import { runOverride } from "../../../hooks/index.js";
import { contentValidationErrorsSchema, formatValidationErrors, validateContentTree } from "../../../puck/validate-content.js";

export async function POST(context: APIContext): Promise<Response> {
    const db = getDb();
    const { typeId, id } = context.params;

    if (!typeId) {
        return new Response("Missing content type id", { status: 400 });
    }

    const pageId = id;
    const isNew = !pageId;
    let page: InferSelectModel<typeof pages> | undefined;

    if (pageId) {
        [page] = await db.select().from(pages).where(eq(pages.id, pageId)).limit(1);
        if (!page) {
            return new Response("Content not found", { status: 404 });
        }
    }

    if (!page) {
        page = Object.fromEntries(
            Object.entries(getTableColumns(pages)).map(([key, col]: [string, any]) => {
                let value: unknown;
                if (col.defaultFn !== undefined) value = col.defaultFn();
                else if (col.default !== undefined) value = col.default;
                else if (col.dataType === 'number') value = 0;
                else value = '';
                return [key, value];
            })
        ) as InferSelectModel<typeof pages>;
    }

    const formData = await context.request.formData();
    const contentField = formData.get("content");
    const contentSchema = z.string().refine((val) => {
        try {
            JSON.parse(val);
            return true;
        } catch (_e) {
            return false;
        }
    }, "Content must be a valid JSON string");
    const contentResult = contentSchema.safeParse(contentField);

    if (!contentResult.success) {
        const alert = createAlert(alertType.error, "Invalid content submitted");
        await addAlertToSession(context.session, alert);
        return context.redirect(isNew ? `/admin/content/${typeId}/new` : `/admin/content/${typeId}/edit/${pageId}`);
    }

    const parsedContent = JSON.parse(contentResult.data);

    const validationErrors = validateContentTree(externalPuckConfig ?? {}, parsedContent);
    const overrideErrors = await runOverride(
        "content:validate",
        { entity: "content", contentType: typeId, content: parsedContent },
        contentValidationErrorsSchema,
    );
    if (overrideErrors) validationErrors.push(...overrideErrors);
    if (validationErrors.length > 0) {
        const alert = createAlert(alertType.error, `Fix the following before saving: ${formatValidationErrors(validationErrors)}`);
        await addAlertToSession(context.session, alert);
        return context.redirect(isNew ? `/admin/content/${typeId}/new` : `/admin/content/${typeId}/edit/${pageId}`);
    }

    if (isNew) {
        page.content = parsedContent;
        page.state = 1;
        page.contentType = typeId;
        // `page` is synthesized from the table's column defaults above, so `page.id` is drizzle's
        // `gen_random_uuid()` SQL expression rather than a real id. Adopt the row Postgres actually
        // inserted — otherwise that expression gets re-evaluated into an unrelated uuid for the
        // publish node's entityId, and serialized verbatim into the audit action's data.id.
        const [inserted] = await db.insert(pages).values(page).returning();
        if (inserted) page = inserted;
    } else {
        await db.update(pages).set({ content: parsedContent }).where(eq(pages.id, page.id));
    }

    const [latestPublishNode] = await db
        .select()
        .from(dagNodes)
        .where(and(eq(dagNodes.entityType, 'content'), eq(dagNodes.entityId, page.id), eq(dagNodes.nodeType, 'publish')))
        .orderBy(desc(dagNodes.createdAt))
        .limit(1);

    const [publishNode] = await db.insert(dagNodes).values({
        entityType: 'content',
        entityId: page.id,
        parentId: latestPublishNode?.id ?? null,
        content: parsedContent,
        nodeType: 'publish',
    }).returning();

    const userId = await context.session?.get("userId");
    await addAction(
        isNew ? "content:create" : "content:update",
        { id: page.id, version: publishNode?.id ?? null },
        userId,
        {
            message: isNew ? "Content {id} was created" : "Content {id} was updated",
            placeholders: {
                id: { lookupColumn: pages.id, displayColumn: pages.content, displayPath: ["root", "props", "title"] },
            },
        },
    );

    const alert = createAlert(alertType.success, isNew ? "Content created successfully." : "Content updated successfully.");
    await addAlertToSession(context.session, alert);

    return context.redirect(`/admin/content/${typeId}`);
}
