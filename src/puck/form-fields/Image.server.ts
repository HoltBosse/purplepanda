import { promises as fs } from "node:fs";
import sharp from "sharp";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../db/db.js";
import { media, mediafolders } from "../../db/schema.js";
import { getMediaPath } from "../../media/media.js";
import type { MediaRef } from "../media/ImagePicker.js";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

// SVG is deliberately excluded even though sharp/the image-serving endpoint can read it — it can
// embed <script>, making a public upload field a stored-XSS vector if it's ever served inline.
// Everything else accepted here gets re-encoded (see below) rather than trusted as-is, so the
// exact input format matters less than it otherwise would.
const ALLOWED_FORMATS = new Set(["jpeg", "png", "webp", "gif"]);

// Derives a human-readable title/alt from the uploaded filename: strips the extension and any
// path-like separators, then keeps only letters/numbers/spaces so nothing resembling markup,
// control characters, or path segments ends up in a DB column that's later rendered as-is.
function titleFromFilename(filename: string): string {
  const withoutExt = filename.replace(/\.[^./\\]+$/, "");
  const cleaned = withoutExt
    .replace(/[\\/]/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (cleaned || "Untitled image").slice(0, 255);
}

// The component's Puck config lets an admin pick any folder, including hidden ones, at edit
// time — but the form itself is stored well before any given submission, so the folder could
// since have been deleted; re-checking it's still a live, active folder here (rather than
// trusting the stored id) avoids filing an upload under a folder id that no longer really exists.
async function assertFolderExists(folderId: string): Promise<void> {
  const db = getDb();
  const [folder] = await db
    .select({ id: mediafolders.id })
    .from(mediafolders)
    .where(and(eq(mediafolders.id, folderId), eq(mediafolders.state, 1)))
    .limit(1);
  if (!folder) throw new Error("This field's destination folder is no longer available");
}

// Server-side handler for form-fields/Image.tsx's `processSubmission` hook: turns a posted file
// into a real media asset. Runs only after the request has already passed the form's spam/CSRF
// checks (see submit.ts) — this does real disk + DB writes, so it must never run against an
// unvalidated bot submission.
export async function processImageSubmission(
  raw: FormDataEntryValue | FormDataEntryValue[] | undefined,
  props: Record<string, unknown>,
): Promise<MediaRef | undefined> {
  const file = Array.isArray(raw) ? raw[0] : raw;
  // A file input the visitor never touched still posts an (empty) File — that's "nothing
  // submitted", not an invalid one, so an optional field must let it through before any of the
  // checks below (which are about a file that was actually provided) ever run.
  if (!(file instanceof File) || file.size === 0) return undefined;

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Image must be smaller than 10MB");
  }

  const folder = props.folder as { id?: string } | null | undefined;
  if (!folder?.id) {
    throw new Error("This field isn't configured with a destination folder");
  }
  await assertFolderExists(folder.id);

  const buffer = Buffer.from(await file.arrayBuffer());

  // Identify the file by its actual decoded content, not the client-supplied `type` header
  // (trivially spoofable) or its extension. sharp's own default pixel-count limit also rejects
  // decompression-bomb-style images (huge dimensions in a tiny file) before they're decoded.
  let format: string | undefined;
  try {
    ({ format } = await sharp(buffer).metadata());
  } catch {
    throw new Error("We couldn't process that image, please try a different file");
  }
  if (!format || !ALLOWED_FORMATS.has(format)) {
    throw new Error("Please upload a JPEG, PNG, WebP, or GIF image");
  }

  // Re-encoding — rather than storing the uploaded bytes verbatim — strips EXIF/metadata (which
  // can carry GPS location) and discards anything that isn't genuine pixel data, neutralizing
  // "polyglot" uploads that are a valid image with some other exploitable payload appended.
  let output: Buffer;
  try {
    output = await sharp(buffer, { animated: format === "gif" })
      .toFormat(format as "jpeg" | "png" | "webp" | "gif")
      .toBuffer();
  } catch {
    throw new Error("We couldn't process that image, please try a different file");
  }

  const title = titleFromFilename(file.name);

  const db = getDb();
  const [inserted] = await db
    .insert(media)
    .values({ title, alt: title, folder: folder.id })
    .returning({ id: media.id });
  if (!inserted) {
    throw new Error("We couldn't save that image, please try again");
  }

  // Same on-disk layout as the admin uploader (pages/admin/media/upload.ts): split into two
  // levels of the id's own characters, stored extension-less (format is sniffed from content at
  // serve time — see pages/image/[id].ts), so nothing about the stored path is attacker-influenced.
  const mediaId = inserted.id;
  const mediaPath = getMediaPath();
  const fullMediaPath = `${mediaPath}/${mediaId.slice(0, 2)}/${mediaId.slice(2, 4)}/${mediaId}`;
  const mediaDir = fullMediaPath.substring(0, fullMediaPath.lastIndexOf("/"));

  await fs.mkdir(mediaDir, { recursive: true });
  await fs.writeFile(fullMediaPath, output);

  return { id: mediaId, title, alt: title };
}
