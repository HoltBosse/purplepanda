import type { APIRoute } from "astro";
import * as z from "zod";
import { eq, and } from "drizzle-orm";
import { getDb } from "../../db/db.js";
import { media } from "../../db/schema.js";
import { getMediaPath } from "../../media/media.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from 'sharp';

//TODO: in future support image manip via get params (sharp? package)

const uuidSchema = z.string().uuid();

//TODO: find something to replace this mess later
function getMimeType(buffer: Buffer): string {
  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  // PNG
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  // GIF
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return "image/gif";
  // WebP (RIFF....WEBP)
  if (
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) return "image/webp";
  // BMP
  if (buffer[0] === 0x42 && buffer[1] === 0x4d) return "image/bmp";
  // TIFF (little-endian)
  if (buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00) return "image/tiff";
  // TIFF (big-endian)
  if (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a) return "image/tiff";
  // SVG
  const text = buffer.subarray(0, 100).toString("utf-8").trimStart();
  if (text.startsWith("<svg") || text.startsWith("<?xml")) return "image/svg+xml";
  return "application/octet-stream";
}

export const GET: APIRoute = async ({ params, request }) => {
  const parsed = uuidSchema.safeParse(params.id);
  if (!parsed.success) {
    return new Response(null, { status: 404 });
  }

  // Read image transform options from query params (GET-safe).
  const searchParams = new URL(request.url).searchParams;
  const fmt = z.enum(["jpeg", "png", "webp", "avif"]).optional().safeParse(searchParams.get("fmt") ?? undefined);
  const w = z.number().int().positive().optional().safeParse(searchParams.get("w") ? Number(searchParams.get("w")) : undefined);
  const h = z.number().int().positive().optional().safeParse(searchParams.get("h") ? Number(searchParams.get("h")) : undefined);
  const q = z.number().int().min(1).max(100).optional().safeParse(searchParams.get("q") ? Number(searchParams.get("q")) : undefined);

  const id = parsed.data;
  const db = getDb();

  const [row] = await db
    .select({ id: media.id, state: media.state })
    .from(media)
    .where(and(eq(media.id, id), eq(media.state, 1)))
    .limit(1);

  if (!row) {
    return new Response(null, { status: 404 });
  }

  const mediaPath = getMediaPath();
  const filePath = join(mediaPath, id.slice(0, 2), id.slice(2, 4), id);

  let fileBuffer: Buffer;
  try {
    fileBuffer = await readFile(filePath);
  } catch {
    return new Response(null, { status: 404 });
  }

  if(fmt.success || w.success || h.success || q.success) {
    let image = sharp(fileBuffer);

    if(w.success || h.success) {
      image = image.resize(w.success ? w.data : undefined, h.success ? h.data : undefined);
    }

    if(fmt.success) {
      if(fmt.data === "jpeg") {
        image = image.jpeg({ quality: q.success ? q.data : 100 });
      } else if(fmt.data === "png") {
        image = image.png({ quality: q.success ? q.data : 100 });
      } else if(fmt.data === "webp") {
        image = image.webp({ quality: q.success ? q.data : 100 });
      } else if(fmt.data === "avif") {
        image = image.avif({ quality: q.success ? q.data : 100 });
      }
    }

    fileBuffer = await image.toBuffer();
  }

  const mimeType = getMimeType(fileBuffer);

  return new Response(fileBuffer.buffer as ArrayBuffer, {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(fileBuffer.byteLength),
    },
  });
};
