import type { APIContext } from "astro";
import * as z from "zod";
import { addAlertToSession, alertType, createAlert } from "../../../alert/index.js";
import { addAction } from "../../../audit/index.js";
import { getDb } from "../../../db/db.js";
import { documents } from "../../../db/schema.js";
import { getDocumentStorage, storageKey } from "../../../storage/index.js";

const MAX_UPLOAD_BYTES = 512 * 1024 * 1024; // 512MB

const toSlug = (title: string) =>
    title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export async function POST(context: APIContext): Promise<Response> {
    const db = getDb();

    const formData = await context.request.formData();
    const title = z.array(z.string().min(1).max(255)).safeParse(formData.getAll("title[]"));
    const file = z.array(z.instanceof(File)).safeParse(formData.getAll("file[]"));

    if (!title.success || !file.success || title.data.length === 0) {
        const alert = createAlert(alertType.error, "Invalid form data. Please provide a title and a file.");
        await addAlertToSession(context.session, alert);
        return context.redirect("/admin/documents");
    }

    if (file.data.some((f) => f.size > MAX_UPLOAD_BYTES)) {
        const alert = createAlert(alertType.error, "Each file must be smaller than 512MB.");
        await addAlertToSession(context.session, alert);
        return context.redirect("/admin/documents");
    }

    const userId = await context.session?.get("userId");

    for (let i = 0; i < file.data.length; i++) {
        const [inserted] = await db.insert(documents).values({
            title: title.data[i]!,
            slug: toSlug(title.data[i]!),
        }).returning({ id: documents.id });

        if (!inserted) {
            const alert = createAlert(alertType.error, "Failed to insert document into database.");
            await addAlertToSession(context.session, alert);
            return context.redirect("/admin/documents");
        }

        const docId = inserted.id;
        await addAction(
            "document:create",
            { id: docId },
            userId,
            {
                message: "Document {id} was created",
                placeholders: {
                    id: { lookupColumn: documents.id, displayColumn: documents.title },
                },
            },
        );
        const buffer = await file.data[i]!.arrayBuffer();
        await getDocumentStorage().write(storageKey(docId), Buffer.from(buffer));
    }

    const alert = createAlert(alertType.success, "Document uploaded successfully.");
    await addAlertToSession(context.session, alert);
    return context.redirect("/admin/documents");
}
