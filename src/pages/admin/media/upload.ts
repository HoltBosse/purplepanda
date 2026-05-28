import type { APIContext } from "astro";
import { createAlert, alertType, addAlertToSession } from "../../../alert/index.js";
import { validateForm, createUserAlertMessageFromArray, getFieldByName, formDataToRecord } from "../../../form/index.js";
import { createFormFlashSession } from "../../../form/session.js";
import { getProfileForm } from "../profile/form.js";
import { getAllFields } from "../../../form/index.js";
import { getDb } from "../../../db/db.js";
import { getMediaPath } from "../../../media/media.js";
import { mediafolders, media } from "../../../db/schema.js";
import { eq, and, getTableColumns, type InferSelectModel, inArray } from 'drizzle-orm';
import { get } from "node:http";
import { hash } from "../../../password/index.js";
import * as z from "zod";
import fs from "fs";

export async function POST(context: APIContext): Promise<Response> {
    const db = getDb();

    //read title[], alt[], file[], folder[] out of formdata and validate with zod, making sure that file is a array of File and arroy of title and alt are strings with max length of 255, and array of folder is an optional uuid string that exists in the mediafolders table as id
    const formData = await context.request.formData();
    //console.log(formData);
    const title = z.array(z.string().min(1).max(255)).safeParse(formData.getAll("title[]"));
    const alt = z.array(z.string().min(1).max(255)).safeParse(formData.getAll("alt[]"));
    const file = z.array(z.instanceof(File)).safeParse(formData.getAll("file[]"));
    const folder = z.array(z.string().uuid()).optional().safeParse(formData.getAll("folder[]") as string[] | undefined);

    if(!title.success || !alt.success || !file.success || !folder.success) {
        let message = "Invalid form data. Please make sure to provide a title, alt text, and a file.";
        const alert = createAlert(alertType.error, message);
        await addAlertToSession(context.session, alert);
        return context.redirect("/admin/media");
    }

    //validate folders
    if(folder.data) {
        const existingFolders = await db.select().from(mediafolders).where(inArray(mediafolders.id, folder.data));
        if(existingFolders.length !== folder.data.length) {
            let message = "One or more selected folders do not exist.";
            const alert = createAlert(alertType.error, message);
            await addAlertToSession(context.session, alert);
            return context.redirect("/admin/media");
        }
    }

    //use first folder for where to redirect to
    const redirectFolderId = folder.data ? folder.data[0] : null;

    //console.log("Inserting media into database starting soon...");
    //console.log(file);

    //loop over files, insert into media table. take the returned uuid from the db and save the file to the mediaPath with the uuid split into /cc/cc/cccc-cc..... format, making the folders if they dont exist
    for(let i = 0; i < file.data.length; i++) {
        //console.log("Inserting media into database...");
        const [insertedMedia] = await db.insert(media).values({
            title: title.data[i]!,
            alt: alt.data[i]!,
            folder: folder.data ? folder.data[i] ?? null : null,
        }).returning({ id: media.id });

        if(!insertedMedia) {
            let message = "Failed to insert media into database.";
            const alert = createAlert(alertType.error, message);
            await addAlertToSession(context.session, alert);
            return context.redirect(`/admin/media${redirectFolderId ? `/${redirectFolderId}` : ""}`);
        }

        const mediaId = insertedMedia.id;
        const mediaPath = getMediaPath();
        const mediaIdPath = `${mediaId.slice(0, 2)}/${mediaId.slice(2, 4)}/${mediaId}`;
        const fullMediaPath = `${mediaPath}/${mediaIdPath}`;
        const mediaDir = fullMediaPath.substring(0, fullMediaPath.lastIndexOf("/"));
        
        //make sure mediaDir exists
        await fs.promises.mkdir(mediaDir, { recursive: true });
        //save file to disk
        const buffer = await file.data[i]!.arrayBuffer();
        await fs.promises.writeFile(fullMediaPath, Buffer.from(buffer));
    }

    let message = "Media uploaded successfully.";

    const alert = createAlert(alertType.success, message);
    await addAlertToSession(context.session, alert);

    return context.redirect(`/admin/media${redirectFolderId ? `/${redirectFolderId}` : ""}`);
}
