import type { APIContext } from "astro";
import { and, desc, eq, getTableColumns, type InferSelectModel } from 'drizzle-orm';
import * as z from "zod";
import { addAction } from "../../../actions/index.js";
import { addAlertToSession, alertType, createAlert } from "../../../alert/index.js";
import { getDb } from "../../../db/db.js";
import { dagNodes, templates } from "../../../db/schema.js";

export async function POST(context: APIContext): Promise<Response> {
    console.log("POST request received for template update");
    const db = getDb();
    //get [id] from url
    const { id } = context.params;
    console.log("ID:");
    console.log(id);
    const templateId = id;
    const isNewTemplate = !templateId;
    let template: InferSelectModel<typeof templates> | undefined;

    if (templateId) {
        [template] = await db.select().from(templates).where(eq(templates.id, templateId)).limit(1);
        if (!template) {
            return new Response("Template not found", { status: 404 });
        }
    }

    if (!template) {
        template = Object.fromEntries(
            Object.entries(getTableColumns(templates)).map(([key, col]: [string, any]) => {
                let value: unknown;
                if (col.defaultFn !== undefined) value = col.defaultFn();
                else if (col.default !== undefined) value = col.default;
                else if (col.dataType === 'number') value = 0;
                else value = '';
                return [key, value];
            })
        ) as InferSelectModel<typeof templates>;
    }

    //use zod to get content field from form data and validate that its a valid json
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
        const alert = createAlert(alertType.error, "Invalid content Submitted");
        await addAlertToSession(context.session, alert);

        let redirectUrl = `/admin/templates/edit/${templateId}`;
        if (isNewTemplate) {
            redirectUrl = "/admin/templates/new";
        }

        return context.redirect(redirectUrl);
    }

    const parsedContent = JSON.parse(contentResult.data);

    if(isNewTemplate) {
        template.content = parsedContent;
        template.state = 1;
        // `template` is synthesized from the table's column defaults above, so `template.id` is
        // drizzle's `gen_random_uuid()` SQL expression rather than a real id. Adopt the row Postgres
        // actually inserted — otherwise that expression gets re-evaluated into an unrelated uuid for
        // the publish node's entityId, and serialized verbatim into the audit action's data.id.
        const [inserted] = await db.insert(templates).values(template).returning();
        if (inserted) template = inserted;
    } else {
        await db.update(templates).set({ content: parsedContent }).where(eq(templates.id, template.id));
    }

    const [latestPublishNode] = await db
        .select()
        .from(dagNodes)
        .where(and(eq(dagNodes.entityType, 'template'), eq(dagNodes.entityId, template.id), eq(dagNodes.nodeType, 'publish')))
        .orderBy(desc(dagNodes.createdAt))
        .limit(1);

    const [publishNode] = await db.insert(dagNodes).values({
        entityType: 'template',
        entityId: template.id,
        parentId: latestPublishNode?.id ?? null,
        content: parsedContent,
        nodeType: 'publish',
    }).returning();

    const userId = await context.session?.get("userId");
    await addAction(
        isNewTemplate ? "templatecreate" : "templateupdate",
        { id: template.id, version: publishNode?.id ?? null },
        userId,
        {
            message: isNewTemplate ? "Template {id} was created" : "Template {id} was updated",
            placeholders: {
                id: { lookupColumn: templates.id, displayColumn: templates.content, displayPath: ["root", "props", "title"] },
            },
        },
    );

    let message = "Template updated successfully.";
    if(isNewTemplate) {
        message = "Template created successfully.";
    }

    const alert = createAlert(alertType.success, message);
    await addAlertToSession(context.session, alert);

    return context.redirect("/admin/templates");
}
