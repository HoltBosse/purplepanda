import type { APIContext } from "astro";
import { createAlert, alertType, addAlertToSession } from "../../../alert/index.js";
import { getDb } from "../../../db/db.js";
import { forms, dagNodes } from "../../../db/schema.js";
import { eq, and, desc, getTableColumns, type InferSelectModel } from 'drizzle-orm';
import * as z from "zod";
import { addAction } from "../../../actions/index.js";

export async function POST(context: APIContext): Promise<Response> {
    const db = getDb();
    const { id } = context.params;
    const formId = id;
    let isNewForm = !formId;
    let form: InferSelectModel<typeof forms> | undefined;

    if (formId) {
        [form] = await db.select().from(forms).where(eq(forms.id, formId)).limit(1);
        if (!form) {
            return new Response("Form not found", { status: 404 });
        }
    }

    if (!form) {
        form = Object.fromEntries(
            Object.entries(getTableColumns(forms)).map(([key, col]: [string, any]) => {
                let value: unknown;
                if (col.defaultFn !== undefined) value = col.defaultFn();
                else if (col.default !== undefined) value = col.default;
                else if (col.dataType === 'number') value = 0;
                else value = '';
                return [key, value];
            })
        ) as InferSelectModel<typeof forms>;
    }

    const formData = await context.request.formData();
    const contentField = formData.get("content");
    const contentSchema = z.string().refine((val) => {
        try {
            JSON.parse(val);
            return true;
        } catch (e) {
            return false;
        }
    }, "Content must be a valid JSON string");
    const contentResult = contentSchema.safeParse(contentField);

    if (!contentResult.success) {
        const alert = createAlert(alertType.error, "Invalid content submitted");
        await addAlertToSession(context.session, alert);
        return context.redirect(isNewForm ? "/admin/forms/new" : `/admin/forms/edit/${formId}`);
    }

    const parsedContent = JSON.parse(contentResult.data);

    if (isNewForm) {
        form.content = parsedContent;
        form.state = 1;
        // `form` is synthesized from the table's column defaults above, so `form.id` is drizzle's
        // `gen_random_uuid()` SQL expression rather than a real id. Adopt the row Postgres actually
        // inserted — otherwise that expression gets re-evaluated into an unrelated uuid for the
        // publish node's entityId, and serialized verbatim into the audit action's data.id.
        const [inserted] = await db.insert(forms).values(form).returning();
        if (inserted) form = inserted;
    } else {
        await db.update(forms).set({ content: parsedContent }).where(eq(forms.id, form.id));
    }

    const [latestPublishNode] = await db
        .select()
        .from(dagNodes)
        .where(and(eq(dagNodes.entityType, 'form'), eq(dagNodes.entityId, form.id), eq(dagNodes.nodeType, 'publish')))
        .orderBy(desc(dagNodes.createdAt))
        .limit(1);

    const [publishNode] = await db.insert(dagNodes).values({
        entityType: 'form',
        entityId: form.id,
        parentId: latestPublishNode?.id ?? null,
        content: parsedContent,
        nodeType: 'publish',
    }).returning();

    const userId = await context.session?.get("userId");
    await addAction(
        isNewForm ? "formcreate" : "formupdate",
        { id: form.id, version: publishNode?.id ?? null },
        userId,
        {
            message: isNewForm ? "Form {id} was created" : "Form {id} was updated",
            placeholders: {
                id: { lookupColumn: forms.id, displayColumn: forms.content, displayPath: ["root", "props", "name"] },
            },
        },
    );

    const alert = createAlert(alertType.success, isNewForm ? "Form created successfully." : "Form updated successfully.");
    await addAlertToSession(context.session, alert);

    return context.redirect("/admin/forms");
}
