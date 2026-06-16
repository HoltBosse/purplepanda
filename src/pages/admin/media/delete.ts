import type { APIContext } from "astro";
import { createAlert, alertType, addAlertToSession } from "../../../alert/index.js";
import { getDb } from "../../../db/db.js";
import { mediafolders, media } from "../../../db/schema.js";
import { inArray } from 'drizzle-orm';
import * as z from "zod";

async function getAllDescendantFolderIds(folderIds: string[]): Promise<string[]> {
    const db = getDb();
    const allIds = new Set<string>(folderIds);
    let toProcess = [...folderIds];

    while (toProcess.length > 0) {
        const children = await db
            .select({ id: mediafolders.id })
            .from(mediafolders)
            .where(inArray(mediafolders.parent, toProcess));

        const newIds = children
            .map((c) => c.id)
            .filter((id) => !allIds.has(id));

        for (const id of newIds) allIds.add(id);
        toProcess = newIds;
    }

    return [...allIds];
}

export async function POST(context: APIContext): Promise<Response> {
    const db = getDb();
    const formData = await context.request.formData();

    const mediaIdsParsed = z.array(z.string().uuid()).safeParse(formData.getAll("mediaid[]"));
    const folderIdsParsed = z.array(z.string().uuid()).safeParse(formData.getAll("folderid[]"));
    const currentFolderIdParsed = z.string().uuid().optional().safeParse(formData.get("currentfolderid") || undefined);

    if (!mediaIdsParsed.success || !folderIdsParsed.success) {
        const alert = createAlert(alertType.error, "Invalid delete request.");
        await addAlertToSession(context.session, alert);
        return context.redirect("/admin/media");
    }

    const mediaIds = mediaIdsParsed.data;
    const folderIds = folderIdsParsed.data;

    if (mediaIds.length === 0 && folderIds.length === 0) {
        const alert = createAlert(alertType.error, "Nothing selected to delete.");
        await addAlertToSession(context.session, alert);
        const currentFolderId = currentFolderIdParsed.success ? currentFolderIdParsed.data : undefined;
        return context.redirect(currentFolderId ? `/admin/media/${currentFolderId}` : "/admin/media");
    }

    // Expand to all descendant folders so nested content is cleaned up too
    const allFolderIds = folderIds.length > 0 ? await getAllDescendantFolderIds(folderIds) : [];

    // Soft-delete media inside affected folders
    if (allFolderIds.length > 0) {
        await db.update(media).set({ state: 0 }).where(inArray(media.folder, allFolderIds));
    }

    // Soft-delete directly selected media
    if (mediaIds.length > 0) {
        await db.update(media).set({ state: 0 }).where(inArray(media.id, mediaIds));
    }

    // Soft-delete all affected folders (roots + descendants)
    if (allFolderIds.length > 0) {
        await db.update(mediafolders).set({ state: 0 }).where(inArray(mediafolders.id, allFolderIds));
    }

    // If the current folder was among those deleted, redirect to root
    const currentFolderId = currentFolderIdParsed.success ? currentFolderIdParsed.data : undefined;
    const currentFolderDeleted = currentFolderId && folderIds.includes(currentFolderId);
    const redirectPath = currentFolderDeleted || !currentFolderId
        ? "/admin/media"
        : `/admin/media/${currentFolderId}`;

    const alert = createAlert(alertType.success, "Deleted successfully.");
    await addAlertToSession(context.session, alert);
    return context.redirect(redirectPath);
}
