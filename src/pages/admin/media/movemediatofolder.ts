import type { APIContext } from "astro";
import { eq, inArray } from 'drizzle-orm';
import * as z from "zod";
import { addAction } from "../../../actions/index.js";
import { addAlertToSession, alertType, createAlert } from "../../../alert/index.js";
import { getDb } from "../../../db/db.js";
import { mediafolders, media as mediaschema } from "../../../db/schema.js";

export async function POST(context: APIContext): Promise<Response> {
    const db = getDb();

    //read title[], alt[], file[], folder[] out of formdata and validate with zod, making sure that file is a array of File and arroy of title and alt are strings with max length of 255, and array of folder is an optional uuid string that exists in the mediafolders table as id
    const formData = await context.request.formData();
    //console.log(formData);
    const folder = z.preprocess((value) => {
        if(value === null || value === undefined || value === "" || value === "null") return null;
        return value;
    }, z.union([z.uuid(), z.null()])).safeParse(formData.get("folderid") as string | null);
    const media = z.array(z.uuid()).safeParse(formData.getAll("mediaid[]") as string[] | undefined);
    //console.log(id);

    if(!media.success || !folder.success) {
        console.log(media);
        console.log(folder);
        console.log(formData.getAll("folderid"));
        const message = "Invalid move request. Issue with selected media or folder.";
        const alert = createAlert(alertType.error, message);
        await addAlertToSession(context.session, alert);
        return context.redirect("/admin/media");
    }

    //validate folders
    if(folder.data) {
        const [existingFolder] = await db.select().from(mediafolders).where(eq(mediafolders.id, folder.data));
        if(!existingFolder) {
            const message = "Selected folder does not exist.";
            const alert = createAlert(alertType.error, message);
            await addAlertToSession(context.session, alert);
            return context.redirect("/admin/media");
        }
    }

    const existingMedia = await db
        .select({ id: mediaschema.id, folder: mediaschema.folder })
        .from(mediaschema)
        .where(inArray(mediaschema.id, media.data));
    const oldFolderById = new Map(existingMedia.map((m) => [m.id, m.folder]));

    const userId = await context.session?.get("userId");

    //update media items to have the new folder
    for(let i = 0; i < media.data.length; i++) {
        if(media?.success && media.data?.[i]) {
            //update alt and title of existing media
            const [updatedMedia] = await db.update(mediaschema).set({
                folder: folder.data,
            }).where(eq(mediaschema.id, media.data[i]!)).returning({ id: mediaschema.id });

            if(!updatedMedia) {
                const message = "Failed to update media in database.";
                const alert = createAlert(alertType.error, message);
                await addAlertToSession(context.session, alert);
                return context.redirect(folder.data ? `/admin/media/${folder.data}` : "/admin/media");
            }

            await addAction(
                "media:move",
                {
                    id: updatedMedia.id,
                    oldFolderId: oldFolderById.get(media.data[i]!) ?? null,
                    newFolderId: folder.data,
                },
                userId,
                {
                    message: "Media {id} was moved to {newFolderId}",
                    placeholders: {
                        id: { lookupColumn: mediaschema.id, displayColumn: mediaschema.title },
                        newFolderId: { lookupColumn: mediafolders.id, displayColumn: mediafolders.name },
                    },
                },
            );
        }
    }

    const message = "Media moved successfully.";

    const alert = createAlert(alertType.success, message);
    await addAlertToSession(context.session, alert);

    return context.redirect(folder.data ? `/admin/media/${folder.data}` : "/admin/media");
}
