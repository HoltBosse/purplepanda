import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { has404Page } from 'virtual:purplepanda/has-404';
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import sharp from 'sharp';
import * as z from "zod";
import { isAdminSession } from "../../auth/index.js";
import { getDb } from "../../db/db.js";
import { media, mediafolders } from "../../db/schema.js";
import { getMediaPath } from "../../media/media.js";

//TODO: in future support image manip via get params (sharp? package)

const uuidSchema = z.uuid();

// A successful image response is fully determined by its id + transform params
// (both baked into the URL and the ETag), so the same URL always yields the
// same bytes until the underlying file changes. Letting the browser reuse it
// for a short window turns the repeated fetches from history-timeline scrubbing
// (which re-renders the same previews many times) into memory-cache hits — no
// network round trip, no repeated `sharp` work — while the ETag still forces a
// revalidation (304) once the window lapses. `private` keeps auth-gated admin
// previews out of any shared/CDN cache.
const IMAGE_CACHE_CONTROL = "private, max-age=300";

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

function etagMatches(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch) return false;
  if (ifNoneMatch.trim() === "*") return true;
  return ifNoneMatch.split(",").some((tag) => tag.trim().replace(/^W\//, "") === etag);
}

// Walks the folder's ancestor chain (not just the immediate parent) since a folder
// inherits hiddenness from any hidden ancestor.
async function isInHiddenFolder(db: ReturnType<typeof getDb>, folderId: string | null): Promise<boolean> {
  let currentId = folderId;
  const visited = new Set<string>();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);

    const [folder] = await db
      .select({ parent: mediafolders.parent, visibility: mediafolders.visibility })
      .from(mediafolders)
      .where(eq(mediafolders.id, currentId))
      .limit(1);

    if (!folder) break;
    if (folder.visibility === -1) return true;

    currentId = folder.parent;
  }

  return false;
}

// Referer paths allowed to bypass a hidden folder's visibility — the only admin
// views that actually render media assets directly.
const VISIBILITY_BYPASS_REFERER_PREFIXES = ["/admin/media", "/admin/forms/submissions"];

// A hidden asset is only ever served to a request that is both (a) an
// authenticated admin session and (b) actually navigating from one of the admin
// views above — requiring both means a logged-in admin browsing the public site
// doesn't leak hidden images there, and a spoofed Referer alone can't pull a
// hidden image without a real admin session behind it.
async function canBypassVisibility(request: Request, session: Parameters<typeof isAdminSession>[0]): Promise<boolean> {
  const referer = request.headers.get("referer");
  if (!referer) return false;

  let refererUrl: URL;
  try {
    refererUrl = new URL(referer);
  } catch {
    return false;
  }

  if (refererUrl.origin !== new URL(request.url).origin) return false;
  if (!VISIBILITY_BYPASS_REFERER_PREFIXES.some((prefix) => refererUrl.pathname.startsWith(prefix))) return false;

  return isAdminSession(session);
}

export const GET: APIRoute = async ({ params, request, rewrite, session }) => {
  const parsed = uuidSchema.safeParse(params.id);
  if (!parsed.success) {
    if (has404Page) {
      return rewrite('/404');
    }
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
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
    .select({ id: media.id, state: media.state, folder: media.folder })
    .from(media)
    .where(and(eq(media.id, id), eq(media.state, 1)))
    .limit(1);

  if (!row) {
    if (has404Page) {
      return rewrite('/404');
    }
    return new Response('Not Found', { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  // A bypassed response must never be cached: HTTP caching keys on URL, not on
  // Referer or session, so a cached copy would keep serving a hidden asset to
  // later same-URL requests (e.g. from a public page in the same browser) that
  // wouldn't themselves pass the bypass check.
  let bypassed = false;
  if (await isInHiddenFolder(db, row.folder)) {
    if (!(await canBypassVisibility(request, session))) {
      if (has404Page) {
        return rewrite('/404');
      }
      return new Response('Not Found', { status: 404, headers: { "Cache-Control": "no-store" } });
    }
    bypassed = true;
  }

  const mediaPath = getMediaPath();
  const filePath = join(mediaPath, id.slice(0, 2), id.slice(2, 4), id);

  let fileStat: Awaited<ReturnType<typeof stat>>;
  try {
    fileStat = await stat(filePath);
  } catch {
    if (has404Page) return rewrite('/404');
    return new Response('Not Found', { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  // Only params that change the output bytes belong in the etag — the DB `state`
  // filter above already turns a disabled image into a 404 before we get here.
  const paramEntries: [string, string | number][] = [];
  if (fmt.success && fmt.data !== undefined) paramEntries.push(["fmt", fmt.data]);
  if (w.success && w.data !== undefined) paramEntries.push(["w", w.data]);
  if (h.success && h.data !== undefined) paramEntries.push(["h", h.data]);
  if (q.success && q.data !== undefined) paramEntries.push(["q", q.data]);
  if (x1.success && x1.data !== undefined) paramEntries.push(["x1", x1.data]);
  if (y1.success && y1.data !== undefined) paramEntries.push(["y1", y1.data]);
  if (x2.success && x2.data !== undefined) paramEntries.push(["x2", x2.data]);
  if (y2.success && y2.data !== undefined) paramEntries.push(["y2", y2.data]);
  const paramString = paramEntries.map(([k, v]) => `${k}=${v}`).join("&");

  const etag = `"${createHash("sha1")
    .update(`${id}:${fileStat.mtimeMs}:${fileStat.size}:${paramString}`)
    .digest("hex")}"`;

  const cacheControl = bypassed ? "private, no-store" : IMAGE_CACHE_CONTROL;

  if (!bypassed && etagMatches(request.headers.get("if-none-match"), etag)) {
    return new Response(null, {
      status: 304,
      headers: { "ETag": etag, "Cache-Control": cacheControl },
    });
  }

  const hasTransform = paramEntries.length > 0;

  if (hasTransform) {
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
      return new Response('Not Found', { status: 404, headers: { "Cache-Control": "no-store" } });
    }

    // sharp has no SVG output encoder, so mimeType here is always a raster format
    // (jpeg/png/webp/avif) — no CSP needed, unlike the raw-passthrough response below.
    const mimeType = getMimeType(outputBuffer);
    return new Response(outputBuffer.buffer as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(outputBuffer.byteLength),
        ...(bypassed ? {} : { "ETag": etag }),
        "Cache-Control": cacheControl,
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  // #2: stream directly — read only 12 magic bytes for MIME detection
  const fh = await open(filePath, 'r');
  const magicBuf = Buffer.alloc(12);
  await fh.read(magicBuf, 0, 12, 0);
  await fh.close();

  const mimeType = getMimeType(magicBuf);
  const stream = Readable.toWeb(createReadStream(filePath));

  return new Response(stream as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Content-Length": String(fileStat.size),
      ...(bypassed ? {} : { "ETag": etag }),
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff",
      // SVG is the only format streamed here unmodified (sharp always rasterizes SVG
      // when a transform is requested above), so it's the only one that can carry a
      // <script>. This CSP neutralizes it even if the file is opened directly or
      // embedded via <object>/<iframe>.
      ...(mimeType === "image/svg+xml" ? { "Content-Security-Policy": "script-src 'none'; sandbox" } : {}),
    },
  });
};
