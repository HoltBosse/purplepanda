import type { APIContext } from "astro";
import { createAlert, alertType, addAlertToSession } from "../../../alert/index.js";
import { validateForm, createUserAlertMessageFromArray, getFieldByName, formDataToRecord } from "../../../form/index.js";
import { createFormFlashSession } from "../../../form/session.js";
import { getProfileForm } from "../profile/form.js";
import { getAllFields } from "../../../form/index.js";
import { getDb } from "../../../db/db.js";
import { templates } from "../../../db/schema.js";
import { eq, getTableColumns, type InferSelectModel } from 'drizzle-orm';
import { get } from "node:http";
import { hash } from "../../../password/index.js";
import * as z from "zod";

export async function POST(context: APIContext): Promise<Response> {
    console.log("POST request received for template update");
    const db = getDb();
    //get [id] from url
    const { id } = context.params;
    console.log("ID:");
    console.log(id);
    const templateId = id;
    let isNewTemplate = !templateId;
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
        } catch (e) {
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

    if(isNewTemplate) {
        template.content = JSON.parse(contentResult.data);
        template.state = 1;

        await db.insert(templates).values(template).returning();
    } else {
        await db.update(templates).set({ content: JSON.parse(contentResult.data) }).where(eq(templates.id, template.id));
    }

    let message = "Template updated successfully.";
    if(isNewTemplate) {
        message = "Template created successfully.";
    }

    const alert = createAlert(alertType.success, message);
    await addAlertToSession(context.session, alert);

    return context.redirect("/admin/templates");
}
