import fs from "node:fs";
import type { APIContext } from "astro";
import { eq, inArray } from 'drizzle-orm';
import * as z from "zod";
import { addAction } from "../../../actions/index.js";
import { addAlertToSession, alertType, createAlert } from "../../../alert/index.js";
import { getDb } from "../../../db/db.js";
import { media, mediafolders } from "../../../db/schema.js";
import { getMediaPath } from "../../../media/media.js";

export async function POST(context: APIContext): Promise<Response> {
    const db = getDb();

    //read title[], alt[], file[], folder[] out of formdata and validate with zod, making sure that file is a array of File and arroy of title and alt are strings with max length of 255, and array of folder is an optional uuid string that exists in the mediafolders table as id
    const formData = await context.request.formData();
    //console.log(formData);
    const title = z.array(z.string().min(1).max(255)).safeParse(formData.getAll("title[]"));
    const alt = z.array(z.string().min(1).max(255)).safeParse(formData.getAll("alt[]"));
    const file = z.array(z.instanceof(File)).safeParse(formData.getAll("file[]"));
    const folder = z.array(z.uuid()).optional().safeParse(formData.getAll("folder[]") as string[] | undefined);
    const id = z.array(z.uuid().optional()).safeParse(formData.getAll("id[]") as string[] | undefined);
    //console.log(id);

    if(!title.success || !alt.success || !file.success || !folder.success) {
        const message = "Invalid form data. Please make sure to provide a title, alt text, and a file.";
        const alert = createAlert(alertType.error, message);
        await addAlertToSession(context.session, alert);
        return context.redirect("/admin/media");
    }

    //validate folders
    if(folder.data) {
        const dedupedFolders = [...new Set(folder.data)];
        const existingFolders = await db.select().from(mediafolders).where(inArray(mediafolders.id, folder.data));
        if(existingFolders.length !== dedupedFolders.length) {
            const message = "One or more selected folders do not exist.";
            const alert = createAlert(alertType.error, message);
            await addAlertToSession(context.session, alert);
            return context.redirect("/admin/media");
        }
    }

    //use first folder for where to redirect to
    const redirectFolderId = folder.data ? folder.data[0] : null;

    //console.log("Inserting media into database starting soon...");
    //console.log(file);

    const uploadedIds: string[] = [];
    const updatedIds: string[] = [];

    //loop over files, insert into media table. take the returned uuid from the db and save the file to the mediaPath with the uuid split into /cc/cc/cccc-cc..... format, making the folders if they dont exist
    for(let i = 0; i < file.data.length; i++) {
        if(id?.success && id.data?.[i]) {
            //update alt and title of existing media
            const [updatedMedia] = await db.update(media).set({
                title: title.data[i]!,
                alt: alt.data[i]!,
                folder: folder.data ? folder.data[i] ?? null : null,
            }).where(eq(media.id, id.data[i]!)).returning({ id: media.id });

            if(!updatedMedia) {
                const message = "Failed to update media in database.";
                const alert = createAlert(alertType.error, message);
                await addAlertToSession(context.session, alert);
                return context.redirect(`/admin/media${redirectFolderId ? `/${redirectFolderId}` : ""}`);
            }

            updatedIds.push(updatedMedia.id);
            continue;
        }

        //console.log("Inserting media into database...");
        const [insertedMedia] = await db.insert(media).values({
            title: title.data[i]!,
            alt: alt.data[i]!,
            folder: folder.data ? folder.data[i] ?? null : null,
        }).returning({ id: media.id });

        if(!insertedMedia) {
            const message = "Failed to insert media into database.";
            const alert = createAlert(alertType.error, message);
            await addAlertToSession(context.session, alert);
            return context.redirect(`/admin/media${redirectFolderId ? `/${redirectFolderId}` : ""}`);
        }

        const mediaId = insertedMedia.id;
        uploadedIds.push(mediaId);
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

    const userId = await context.session?.get("userId");
    if(uploadedIds.length > 0) {
        await addAction(
            "mediaupload",
            { ids: uploadedIds },
            userId,
            {
                message: "Media {ids} was uploaded",
            },
        );
    }
    if(updatedIds.length > 0) {
        await addAction(
            "mediaupdate",
            { ids: updatedIds },
            userId,
            {
                message: "Media {ids} was updated",
            },
        );
    }

    const message = "Media uploaded successfully.";

    const alert = createAlert(alertType.success, message);
    await addAlertToSession(context.session, alert);

    return context.redirect(`/admin/media${redirectFolderId ? `/${redirectFolderId}` : ""}`);
}
