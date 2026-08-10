import type { APIContext } from "astro";
import { eq } from "drizzle-orm";
import * as z from "zod";
import { addAction } from "../../../actions/index.js";
import { addAlertToSession, alertType, createAlert } from "../../../alert/index.js";
import { getDb } from "../../../db/db.js";
import { redirects } from "../../../db/schema.js";

const pathSchema = z.string().min(1).max(2048);

export async function POST(context: APIContext): Promise<Response> {
    const db = getDb();
    const { id } = context.params;
    const isNew = !id;

    const formData = await context.request.formData();
    const fromResult = pathSchema.safeParse(formData.get("from"));
    const toResult = pathSchema.safeParse(formData.get("to"));

    if (!fromResult.success || !toResult.success) {
        const alert = createAlert(alertType.error, "Invalid form data. Both From and To paths are required.");
        await addAlertToSession(context.session, alert);
        return context.redirect(isNew ? "/admin/redirects/new" : `/admin/redirects/edit/${id}`);
    }

    const userId = await context.session?.get("userId");

    if (isNew) {
        const [inserted] = await db.insert(redirects).values({
            from: fromResult.data,
            to: toResult.data,
            state: 1,
        }).returning({ id: redirects.id });

        if (inserted) {
            await addAction(
                "redirectcreate",
                { id: inserted.id },
                userId,
                {
                    message: "Redirect {id} was created",
                    placeholders: {
                        id: { lookupColumn: redirects.id, displayColumn: redirects.from },
                    },
                },
            );
        }
    } else {
        const [existing] = await db.select({ id: redirects.id }).from(redirects).where(eq(redirects.id, id)).limit(1);
        if (!existing) {
            const alert = createAlert(alertType.error, "Redirect not found.");
            await addAlertToSession(context.session, alert);
            return context.redirect("/admin/redirects");
        }
        await db.update(redirects).set({ from: fromResult.data, to: toResult.data }).where(eq(redirects.id, id));
        await addAction(
            "redirectupdate",
            { id },
            userId,
            {
                message: "Redirect {id} was updated",
                placeholders: {
                    id: { lookupColumn: redirects.id, displayColumn: redirects.from },
                },
            },
        );
    }

    const alert = createAlert(alertType.success, isNew ? "Redirect created successfully." : "Redirect updated successfully.");
    await addAlertToSession(context.session, alert);
    return context.redirect("/admin/redirects");
}
