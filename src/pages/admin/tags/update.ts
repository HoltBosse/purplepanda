import type { APIContext } from "astro";
import { eq } from "drizzle-orm";
import * as z from "zod";
import { addAlertToSession, alertType, createAlert } from "../../../alert/index.js";
import { getDb } from "../../../db/db.js";
import { tags } from "../../../db/schema.js";

const titleSchema = z.string().min(1).max(255);
const parentTagSchema = z.union([z.literal(""), z.uuid()]);

export async function POST(context: APIContext): Promise<Response> {
    const db = getDb();
    const { id } = context.params;
    const isNew = !id;

    const formData = await context.request.formData();
    const titleResult = titleSchema.safeParse(formData.get("title"));
    const parentTagResult = parentTagSchema.safeParse(formData.get("parentTag") ?? "");

    if (!titleResult.success || !parentTagResult.success) {
        const alert = createAlert(alertType.error, "Invalid form data. A title is required.");
        await addAlertToSession(context.session, alert);
        return context.redirect(isNew ? "/admin/tags/new" : `/admin/tags/edit/${id}`);
    }

    const parentTag = parentTagResult.data || null;

    if (parentTag && !isNew && parentTag === id) {
        const alert = createAlert(alertType.error, "A tag cannot be its own parent.");
        await addAlertToSession(context.session, alert);
        return context.redirect(`/admin/tags/edit/${id}`);
    }

    if (isNew) {
        await db.insert(tags).values({
            title: titleResult.data,
            parentTag,
            state: 1,
        });
    } else {
        const [existing] = await db.select({ id: tags.id }).from(tags).where(eq(tags.id, id)).limit(1);
        if (!existing) {
            const alert = createAlert(alertType.error, "Tag not found.");
            await addAlertToSession(context.session, alert);
            return context.redirect("/admin/tags");
        }
        await db.update(tags).set({ title: titleResult.data, parentTag }).where(eq(tags.id, id));
    }

    const alert = createAlert(alertType.success, isNew ? "Tag created successfully." : "Tag updated successfully.");
    await addAlertToSession(context.session, alert);
    return context.redirect("/admin/tags");
}
