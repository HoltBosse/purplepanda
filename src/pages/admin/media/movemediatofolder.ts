import type { APIContext } from "astro";
import { createAlert, alertType, addAlertToSession } from "../../../alert/index.js";
import { validateForm, createUserAlertMessageFromArray, getFieldByName, formDataToRecord } from "../../../form/index.js";
import { createFormFlashSession } from "../../../form/session.js";
import { getProfileForm } from "../profile/form.js";
import { getAllFields } from "../../../form/index.js";
import { getDb } from "../../../db/db.js";
import { getMediaPath } from "../../../media/media.js";
import { mediafolders, media as mediaschema } from "../../../db/schema.js";
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
    const folder = z.preprocess((value) => {
        if(value === null || value === undefined || value === "" || value === "null") return null;
        return value;
    }, z.union([z.string().uuid(), z.null()])).safeParse(formData.get("folderid") as string | null);
    const media = z.array(z.string().uuid()).safeParse(formData.getAll("mediaid[]") as string[] | undefined);
    //console.log(id);

    if(!media.success || !folder.success) {
        console.log(media);
        console.log(folder);
        console.log(formData.getAll("folderid"));
        let message = "Invalid move request. Issue with selected media or folder.";
        const alert = createAlert(alertType.error, message);
        await addAlertToSession(context.session, alert);
        return context.redirect("/admin/media");
    }

    //validate folders
    if(folder.data) {
        const [existingFolder] = await db.select().from(mediafolders).where(eq(mediafolders.id, folder.data));
        if(!existingFolder) {
            let message = "Selected folder does not exist.";
            const alert = createAlert(alertType.error, message);
            await addAlertToSession(context.session, alert);
            return context.redirect("/admin/media");
        }
    }

    //update media items to have the new folder
    for(let i = 0; i < media.data.length; i++) {
        if(media && media.success && media.data && media.data[i]) {
            //update alt and title of existing media
            const [updatedMedia] = await db.update(mediaschema).set({
                folder: folder.data,
            }).where(eq(mediaschema.id, media.data[i]!)).returning({ id: mediaschema.id });

            if(!updatedMedia) {
                let message = "Failed to update media in database.";
                const alert = createAlert(alertType.error, message);
                await addAlertToSession(context.session, alert);
                return context.redirect(folder.data ? `/admin/media/${folder.data}` : "/admin/media");
            }

            continue;
        }
    }

    let message = "Media moved successfully.";

    const alert = createAlert(alertType.success, message);
    await addAlertToSession(context.session, alert);

    return context.redirect(folder.data ? `/admin/media/${folder.data}` : "/admin/media");
}
