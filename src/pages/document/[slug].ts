import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../db/db.js";
import { documents } from "../../db/schema.js";
import { getDocumentStorage, storageKey } from "../../storage/index.js";

function getMimeType(buffer: Buffer): string {
    // PDF
    if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46)
        return "application/pdf";
    // ZIP-based formats (DOCX, XLSX, PPTX, ODT, …)
    if (buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04)
        return "application/zip";
    // OLE2 compound doc (DOC, XLS, PPT)
    if (buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0)
        return "application/msword";
    return "application/octet-stream";
}

export const GET: APIRoute = async ({ params, rewrite }) => {
    const { slug } = params;
    if (!slug) return new Response(null, { status: 404 });

    const db = getDb();
    const [doc] = await db
        .select()
        .from(documents)
        .where(and(eq(documents.slug, slug), eq(documents.state, 1)))
        .limit(1);

    if (!doc) {
        return rewrite('/404');
    }

    let fileBuffer: Buffer;
    try {
        fileBuffer = await getDocumentStorage().readToBuffer(storageKey(doc.id));
    } catch {
        return rewrite('/404');
    }

    const mimeType = getMimeType(fileBuffer);

    return new Response(fileBuffer.buffer as ArrayBuffer, {
        status: 200,
        headers: {
            "Content-Type": mimeType,
            "Content-Length": String(fileBuffer.byteLength),
            "Content-Disposition": `inline; filename="${doc.title}"`,
            "X-Content-Type-Options": "nosniff",
        },
    });
};
