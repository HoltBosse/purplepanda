import type { APIContext } from "astro";
import { createAlert, alertType, addAlertToSession } from "../../../alert/index.js";
import { getDb } from "../../../db/db.js";
import { getDocumentPath } from "../../../document/document.js";
import { documents } from "../../../db/schema.js";
import { eq } from "drizzle-orm";
import * as z from "zod";
import fs from "fs";
import { addAction } from "../../../actions/index.js";

const toSlug = (title: string) =>
    title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export async function POST(context: APIContext): Promise<Response> {
    const db = getDb();

    const formData = await context.request.formData();
    const id = z.uuid().safeParse(formData.get("id"));
    const title = z.string().min(1).max(255).safeParse(formData.get("title"));
    const file = formData.get("file");
    const hasFile = file instanceof File && file.size > 0;

    if (!id.success || !title.success) {
        const alert = createAlert(alertType.error, "Invalid form data.");
        await addAlertToSession(context.session, alert);
        return context.redirect("/admin/documents");
    }

    const [existing] = await db.select({ id: documents.id }).from(documents).where(eq(documents.id, id.data)).limit(1);
    if (!existing) {
        const alert = createAlert(alertType.error, "Document not found.");
        await addAlertToSession(context.session, alert);
        return context.redirect("/admin/documents");
    }

    await db.update(documents).set({ title: title.data, slug: toSlug(title.data) }).where(eq(documents.id, id.data));

    if (hasFile) {
        const documentPath = getDocumentPath();
        const dir = `${documentPath}/${id.data.slice(0, 2)}/${id.data.slice(2, 4)}`;
        await fs.promises.mkdir(dir, { recursive: true });
        const buffer = await (file as File).arrayBuffer();
        await fs.promises.writeFile(`${dir}/${id.data}`, Buffer.from(buffer));
    }

    const userId = await context.session?.get("userId");
    await addAction(
        "documentupdate",
        { id: id.data },
        userId,
        {
            message: "Document {id} was updated",
            placeholders: {
                id: { lookupColumn: documents.id, displayColumn: documents.title },
            },
        },
    );

    const alert = createAlert(alertType.success, "Document updated successfully.");
    await addAlertToSession(context.session, alert);
    return context.redirect("/admin/documents");
}
