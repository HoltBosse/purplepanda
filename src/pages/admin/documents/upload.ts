import type { APIContext } from "astro";
import { createAlert, alertType, addAlertToSession } from "../../../alert/index.js";
import { getDb } from "../../../db/db.js";
import { getDocumentPath } from "../../../document/document.js";
import { documents } from "../../../db/schema.js";
import * as z from "zod";
import fs from "fs";
import { addAction } from "../../../actions/index.js";

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
            "documentcreate",
            { id: docId },
            userId,
            {
                message: "Document {id} was created",
                placeholders: {
                    id: { lookupColumn: documents.id, displayColumn: documents.title },
                },
            },
        );
        const documentPath = getDocumentPath();
        const dir = `${documentPath}/${docId.slice(0, 2)}/${docId.slice(2, 4)}`;

        await fs.promises.mkdir(dir, { recursive: true });

        const buffer = await file.data[i]!.arrayBuffer();
        await fs.promises.writeFile(`${dir}/${docId}`, Buffer.from(buffer));
    }

    const alert = createAlert(alertType.success, "Document uploaded successfully.");
    await addAlertToSession(context.session, alert);
    return context.redirect("/admin/documents");
}
