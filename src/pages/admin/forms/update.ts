import type { APIContext } from "astro";
import { createAlert, alertType, addAlertToSession } from "../../../alert/index.js";
import { getDb } from "../../../db/db.js";
import { forms } from "../../../db/schema.js";
import { eq, getTableColumns, type InferSelectModel } from 'drizzle-orm';
import * as z from "zod";

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

    if (isNewForm) {
        form.content = JSON.parse(contentResult.data);
        form.state = 1;
        await db.insert(forms).values(form).returning();
    } else {
        await db.update(forms).set({ content: JSON.parse(contentResult.data) }).where(eq(forms.id, form.id));
    }

    const alert = createAlert(alertType.success, isNewForm ? "Form created successfully." : "Form updated successfully.");
    await addAlertToSession(context.session, alert);

    return context.redirect("/admin/forms");
}
