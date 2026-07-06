import type { APIContext } from "astro";
import { createAlert, alertType, addAlertToSession } from "../../../../alert/index.js";
import { getDb } from "../../../../db/db.js";
import { roles } from "../../../../db/schema.js";
import { eq } from "drizzle-orm";
import * as z from "zod";

const titleSchema = z.string().min(1).max(255);
const adminAccessSchema = z.enum(["true", "false"]);

export async function POST(context: APIContext): Promise<Response> {
    const db = getDb();
    const { id } = context.params;
    const isNew = !id;

    const formData = await context.request.formData();
    const titleResult = titleSchema.safeParse(formData.get("title"));
    const adminAccessResult = adminAccessSchema.safeParse(formData.get("adminAccess"));

    if (!titleResult.success || !adminAccessResult.success) {
        const alert = createAlert(alertType.error, "Invalid form data. A title is required.");
        await addAlertToSession(context.session, alert);
        return context.redirect(isNew ? "/admin/users/roles/new" : `/admin/users/roles/edit/${id}`);
    }

    const adminAccess = adminAccessResult.data === "true";

    if (isNew) {
        await db.insert(roles).values({
            title: titleResult.data,
            adminAccess,
            state: 1,
        });
    } else {
        const [existing] = await db.select({ id: roles.id }).from(roles).where(eq(roles.id, id)).limit(1);
        if (!existing) {
            const alert = createAlert(alertType.error, "Role not found.");
            await addAlertToSession(context.session, alert);
            return context.redirect("/admin/users/roles");
        }
        await db.update(roles).set({ title: titleResult.data, adminAccess }).where(eq(roles.id, id));
    }

    const alert = createAlert(alertType.success, isNew ? "Role created successfully." : "Role updated successfully.");
    await addAlertToSession(context.session, alert);
    return context.redirect("/admin/users/roles");
}
