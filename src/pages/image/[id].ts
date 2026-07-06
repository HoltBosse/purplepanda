import type { APIRoute } from "astro";
import * as z from "zod";
import { eq, and } from "drizzle-orm";
import { getDb } from "../../db/db.js";
import { media } from "../../db/schema.js";
import { getMediaPath } from "../../media/media.js";
import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";
import { Readable } from "node:stream";
import { join } from "node:path";
import sharp from 'sharp';
import { has404Page } from 'virtual:purplepanda/has-404';

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
  // AVIF (ISOBMFF: ....ftypavif / ....ftypavis)
  if (
    buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70 &&
    buffer[8] === 0x61 && buffer[9] === 0x76 && buffer[10] === 0x69 && (buffer[11] === 0x66 || buffer[11] === 0x73)
  ) return "image/avif";
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

export const GET: APIRoute = async ({ params, request, rewrite }) => {
  const parsed = uuidSchema.safeParse(params.id);
  if (!parsed.success) {
    if (has404Page) {
      return rewrite('/404');
    }
    return new Response(null, { status: 404 });
  }

  // Read image transform options from query params (GET-safe).
  const searchParams = new URL(request.url).searchParams;
  const fmt = z.enum(["jpeg", "png", "webp", "avif"]).optional().safeParse(searchParams.get("fmt") ?? undefined);
  const w = z.number().int().positive().optional().safeParse(searchParams.get("w") ? Number(searchParams.get("w")) : undefined);
  const h = z.number().int().positive().optional().safeParse(searchParams.get("h") ? Number(searchParams.get("h")) : undefined);
  const q = z.number().int().min(1).max(100).optional().safeParse(searchParams.get("q") ? Number(searchParams.get("q")) : undefined);
  const x1 = z.number().int().min(0).optional().safeParse(searchParams.get("x1") ? Number(searchParams.get("x1")) : undefined);
  const y1 = z.number().int().min(0).optional().safeParse(searchParams.get("y1") ? Number(searchParams.get("y1")) : undefined);
  const x2 = z.number().int().optional().safeParse(searchParams.get("x2") ? Number(searchParams.get("x2")) : undefined);
  const y2 = z.number().int().optional().safeParse(searchParams.get("y2") ? Number(searchParams.get("y2")) : undefined);

  const id = parsed.data;
  const db = getDb();

  const [row] = await db
    .select({ id: media.id, state: media.state })
    .from(media)
    .where(and(eq(media.id, id), eq(media.state, 1)))
    .limit(1);

  if (!row) {
    if (has404Page) {
      return rewrite('/404');
    }
    return new Response('Not Found', { status: 404 });
  }

  const mediaPath = getMediaPath();
  const filePath = join(mediaPath, id.slice(0, 2), id.slice(2, 4), id);

  if (fmt.success || w.success || h.success || q.success || x1.success || y1.success || x2.success || y2.success) {
    // #4: pass file path directly — sharp/libvips reads the file internally
    let image = sharp(filePath);

    //handle crop params (x1,y1,x2,y2) if any are present
    if(x1.success || y1.success || x2.success || y2.success) {
      const metadata = await image.metadata();

      const cropX1 = x1.success && x1.data !== undefined ? x1.data : 0;
      const cropY1 = y1.success && y1.data !== undefined ? y1.data : 0;
      //if x2/y2 are negative, treat them as offsets from the right/bottom edge of the image
      const cropX2 = x2.success && x2.data !== undefined ? (x2.data < 0 ? (metadata.width ?? 0) + x2.data : x2.data) : metadata.width ?? undefined;
      const cropY2 = y2.success && y2.data !== undefined ? (y2.data < 0 ? (metadata.height ?? 0) + y2.data : y2.data) : metadata.height ?? undefined;
      
      image = image.extract({ left: cropX1, top: cropY1, width: (cropX2 as number) - cropX1, height: (cropY2 as number) - cropY1 });
    }

    //handle resize params (w,h) if any are present
    if (w.success || h.success) {
      image = image.resize(w.success ? w.data : undefined, h.success ? h.data : undefined);
    }

    //handle formatting
    if (fmt.success) {
      if (fmt.data === "jpeg") {
        image = image.jpeg({ quality: q.success ? q.data : 100 });
      } else if (fmt.data === "png") {
        image = image.png({ quality: q.success ? q.data : 100 });
      } else if (fmt.data === "webp") {
        image = image.webp({ quality: q.success ? q.data : 100 });
      } else if (fmt.data === "avif") {
        image = image.avif({ quality: q.success ? q.data : 100 });
      }
    }

    let outputBuffer: Buffer;
    try {
      outputBuffer = await image.toBuffer();
    } catch {
      if (has404Page) return rewrite('/404');
      return new Response('Not Found', { status: 404 });
    }

    const mimeType = getMimeType(outputBuffer);
    return new Response(outputBuffer.buffer as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(outputBuffer.byteLength),
      },
    });
  }

  // #2: stream directly — read only 12 magic bytes for MIME detection
  let fh: Awaited<ReturnType<typeof open>>;
  try {
    fh = await open(filePath, 'r');
  } catch {
    if (has404Page) return rewrite('/404');
    return new Response('Not Found', { status: 404 });
  }

  const magicBuf = Buffer.alloc(12);
  const [{ size }] = await Promise.all([fh.stat(), fh.read(magicBuf, 0, 12, 0)]);
  await fh.close();

  const mimeType = getMimeType(magicBuf);
  const stream = Readable.toWeb(createReadStream(filePath));

  return new Response(stream as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(size),
    },
  });
};
