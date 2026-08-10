import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { has404Page } from 'virtual:purplepanda/has-404';
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../db/db.js";
import { documents } from "../../db/schema.js";
import { getDocumentPath } from "../../document/document.js";

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
        if (has404Page) {
            return rewrite('/404');
        }
        return new Response('Not Found', { status: 404 });
    }

    const documentPath = getDocumentPath();
    const filePath = join(documentPath, doc.id.slice(0, 2), doc.id.slice(2, 4), doc.id);

    let fileBuffer: Buffer;
    try {
        fileBuffer = await readFile(filePath);
    } catch {
        if (has404Page) {
            return rewrite('/404');
        }
        return new Response('Not Found', { status: 404 });
    }

    const mimeType = getMimeType(fileBuffer);

    return new Response(fileBuffer.buffer as ArrayBuffer, {
        status: 200,
        headers: {
            "Content-Type": mimeType,
            "Content-Length": String(fileBuffer.byteLength),
            "Content-Disposition": `inline; filename="${doc.title}"`,
        },
    });
};
