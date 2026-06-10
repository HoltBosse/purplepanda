import type { APIContext } from "astro";
import { createAlert, alertType, addAlertToSession } from "../../../alert/index.js";
import { getDb } from "../../../db/db.js";
import { pages } from "../../../db/schema.js";
import { eq, getTableColumns, type InferSelectModel } from 'drizzle-orm';
import * as z from "zod";

export async function POST(context: APIContext): Promise<Response> {
    const db = getDb();
    const { id } = context.params;
    const pageId = id;
    let isNewPage = !pageId;
    let page: InferSelectModel<typeof pages> | undefined;

    if (pageId) {
        [page] = await db.select().from(pages).where(eq(pages.id, pageId)).limit(1);
        if (!page) {
            return new Response("Page not found", { status: 404 });
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
        } catch (e) {
            return false;
        }
    }, "Content must be a valid JSON string");
    const contentResult = contentSchema.safeParse(contentField);

    if (!contentResult.success) {
        const alert = createAlert(alertType.error, "Invalid content submitted");
        await addAlertToSession(context.session, alert);
        return context.redirect(isNewPage ? "/admin/pages/new" : `/admin/pages/edit/${pageId}`);
    }

    if (isNewPage) {
        page.content = JSON.parse(contentResult.data);
        page.state = 1;
        await db.insert(pages).values(page).returning();
    } else {
        await db.update(pages).set({ content: JSON.parse(contentResult.data) }).where(eq(pages.id, page.id));
    }

    const alert = createAlert(alertType.success, isNewPage ? "Page created successfully." : "Page updated successfully.");
    await addAlertToSession(context.session, alert);

    return context.redirect("/admin/pages");
}
