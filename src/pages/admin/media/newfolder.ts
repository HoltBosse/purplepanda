import type { APIContext } from "astro";
import { and, eq } from 'drizzle-orm';
import * as z from "zod";
import { addAlertToSession, alertType, createAlert } from "../../../alert/index.js";
import { getDb } from "../../../db/db.js";
import { mediafolders } from "../../../db/schema.js";

export async function POST(context: APIContext): Promise<Response> {
    const db = getDb();

    //read out posted fields name and parent
    const formData = await context.request.formData();
    const name = z.string().min(1).max(255).safeParse(formData.get("name"));
    const parent = z.uuid().optional().safeParse(formData.get("parent") || undefined);

    console.log(name);
    console.log(parent);

    if(!name.success || !parent.success) {
        const message = "Invalid folder name or parent.";
        const alert = createAlert(alertType.error, message);
        await addAlertToSession(context.session, alert);
        return context.redirect("/admin/media");
    }

    //check via db that the folder doesnt exist in the optional parent
    const conditions = [eq(mediafolders.name, name.data)];
    if (parent.data) {
        conditions.push(eq(mediafolders.parent, parent.data));
    }
    const [existingFolder] = await db.select().from(mediafolders).where(and(...conditions)).limit(1);
    if (existingFolder) {
        const message = "Folder with the same name already exists in the selected parent.";
        const alert = createAlert(alertType.error, message);
        await addAlertToSession(context.session, alert);
        return context.redirect("/admin/media");
    }

    //now insert the folder, with the optional parent
    await db.insert(mediafolders).values({
        name: name.data,
        parent: parent.data || null
    });

    const message = "Folder created successfully.";

    const alert = createAlert(alertType.success, message);
    await addAlertToSession(context.session, alert);

    return context.redirect(`/admin/media${parent.data ? `/${parent.data}` : ""}`);
}
