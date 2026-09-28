import fs from "node:fs";
import { addAction } from "../audit/index.js";
import { getDb } from "../db/db.js";
import { media } from "../db/schema.js";
import { getMediaPath } from "./media.js";

export const MAX_UPLOAD_BYTES = 512 * 1024 * 1024; // 512MB

export type NewMedia = {
    file: File;
    title: string;
    alt: string;
    folder: string | null;
};

export type CreatedMedia = { id: string; title: string; alt: string };

// Inserts each item into the media table and saves its file under the media path, split into
// /cc/cc/cccc-cc..... by id. Shared by the media library's form post and the image picker's upload
// API. Whatever was created is logged as one media:upload entry even if a later item throws, so a
// partial batch doesn't go unrecorded.
export async function createMedia(items: NewMedia[], userId: string): Promise<CreatedMedia[]> {
    const db = getDb();
    const created: CreatedMedia[] = [];

    try {
        for (const item of items) {
            const [inserted] = await db.insert(media).values({
                title: item.title,
                alt: item.alt,
                folder: item.folder,
            }).returning({ id: media.id, title: media.title, alt: media.alt });

            if (!inserted) {
                throw new Error("Failed to insert media into database.");
            }

            const fullMediaPath = `${getMediaPath()}/${inserted.id.slice(0, 2)}/${inserted.id.slice(2, 4)}/${inserted.id}`;
            await fs.promises.mkdir(fullMediaPath.substring(0, fullMediaPath.lastIndexOf("/")), { recursive: true });
            await fs.promises.writeFile(fullMediaPath, Buffer.from(await item.file.arrayBuffer()));

            created.push(inserted);
        }
    } finally {
        if (created.length > 0) {
            await addAction(
                "media:upload",
                { ids: created.map((m) => m.id) },
                userId,
                {
                    message: "Media {ids} was uploaded",
                    placeholders: {
                        ids: { lookupColumn: media.id, displayColumn: media.title },
                    },
                },
            );
        }
    }

    return created;
}
