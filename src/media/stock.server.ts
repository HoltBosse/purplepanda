import "dotenv/config";
import { and, eq, ilike, isNull } from "drizzle-orm";
import * as z from "zod";
import { getDb } from "../db/db.js";
import { media, mediafolders } from "../db/schema.js";
import { type CreatedMedia, createMedia } from "./upload.js";

// Free stock photos from Pexels (https://www.pexels.com/api/) for the AI assistant: searched with
// thumbnails it can look at, then imported into the media library — Pexels' license allows
// downloading and re-hosting, and asks for credit, which goes into each image's title. Enabled by
// setting PEXELS_API_KEY.

const API = "https://api.pexels.com/v1";
// Downloads only ever come from Pexels' own image host, whatever the API returns, so a crafted
// response or model input can't point the server at an arbitrary URL.
const IMAGE_HOST = "images.pexels.com";
const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;
const API_TIMEOUT_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 60_000;
// Raster formats only, by the type Pexels' host declares; SVG (which can carry script) never.
const IMPORT_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const AI_IMPORTS_FOLDER = "AI imports";

export type StockPhoto = {
  id: string;
  description: string;
  photographer: string;
  // A small preview, for choosing.
  thumbnailUrl: string;
  width: number;
  height: number;
};

const photoSchema = z.object({
  id: z.number(),
  width: z.number(),
  height: z.number(),
  alt: z.string().nullable().optional(),
  photographer: z.string(),
  src: z.object({ tiny: z.string(), large2x: z.string() }),
});

function apiKey(): string | undefined {
  return process.env.PEXELS_API_KEY?.trim() || undefined;
}

export function stockPhotosEnabled(): boolean {
  return apiKey() !== undefined;
}

async function pexels(path: string): Promise<unknown> {
  const key = apiKey();
  if (!key) throw new Error("Stock photos aren't configured (PEXELS_API_KEY is not set).");
  const response = await fetch(`${API}${path}`, {
    headers: { Authorization: key },
    redirect: "error",
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Stock photo search failed (${response.status}).`);
  return response.json();
}

// Whether a URL from a Pexels response points at Pexels' own image host, over https.
function isPexelsImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === IMAGE_HOST;
  } catch {
    return false;
  }
}

export async function searchStockPhotos(query: string, page = 1, perPage = 10): Promise<StockPhoto[]> {
  const params = new URLSearchParams({ query, page: String(page), per_page: String(perPage) });
  const body = z.object({ photos: z.array(photoSchema) }).parse(await pexels(`/search?${params}`));
  // Thumbnails are handed to the model as image URLs, so only Pexels' own host is passed on.
  return body.photos.filter((photo) => isPexelsImageUrl(photo.src.tiny)).map((photo) => ({
    id: String(photo.id),
    description: photo.alt ?? "",
    photographer: photo.photographer,
    thumbnailUrl: photo.src.tiny,
    width: photo.width,
    height: photo.height,
  }));
}

// The folder imports land in, created on first use. Visible, so imported images can be used on
// public pages.
async function aiImportsFolder(): Promise<string> {
  const db = getDb();
  const where = and(eq(mediafolders.name, AI_IMPORTS_FOLDER), isNull(mediafolders.parent), eq(mediafolders.state, 1));
  const [existing] = await db.select({ id: mediafolders.id }).from(mediafolders).where(where).limit(1);
  if (existing) return existing.id;
  const [created] = await db.insert(mediafolders).values({ name: AI_IMPORTS_FOLDER }).returning({ id: mediafolders.id });
  if (!created) throw new Error("Couldn't create the AI imports folder.");
  return created.id;
}

// The credit Pexels asks for, kept in the title along with the photo's Pexels id — which is also
// how a photo that's already been imported is recognized rather than imported twice.
function creditSuffix(photographer: string, id: string): string {
  return ` — photo by ${photographer} on Pexels (${id})`;
}

export async function importStockPhoto(input: { id: string; title: string; alt: string; userId: string }): Promise<CreatedMedia> {
  if (!/^\d+$/.test(input.id)) throw new Error(`"${input.id}" isn't a stock photo id.`);
  const db = getDb();
  const [already] = await db
    .select({ id: media.id, title: media.title, alt: media.alt })
    .from(media)
    .where(and(eq(media.state, 1), ilike(media.title, `%on Pexels (${input.id})`)))
    .limit(1);
  if (already) return already;

  const photo = photoSchema.parse(await pexels(`/photos/${input.id}`));
  if (!isPexelsImageUrl(photo.src.large2x)) throw new Error("Unexpected stock photo address.");

  // No redirects: following one would leave the host checked above.
  const response = await fetch(photo.src.large2x, { redirect: "error", signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  const type = (response.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  const extension = IMPORT_TYPES[type];
  if (!response.ok || !extension) throw new Error(`Downloading the stock photo failed (${response.status}).`);
  const bytes = await readCapped(response, MAX_DOWNLOAD_BYTES);

  const suffix = creditSuffix(photo.photographer, input.id);
  const title = `${input.title.trim().slice(0, 255 - suffix.length)}${suffix}`;
  const alt = (input.alt.trim() || photo.alt || input.title).slice(0, 255);
  const [created] = await createMedia(
    [{ file: new File([bytes], `pexels-${input.id}.${extension}`, { type }), title, alt, folder: await aiImportsFolder() }],
    input.userId,
  );
  if (!created) throw new Error("Saving the stock photo failed.");
  return created;
}

// A response body, refused as soon as it's bigger than `limit` (declared or actual) rather than
// after buffering all of it.
async function readCapped(response: Response, limit: number): Promise<Buffer<ArrayBuffer>> {
  const tooLarge = () => new Error("The stock photo is too large to import.");
  if (Number(response.headers.get("content-length") ?? 0) > limit) throw tooLarge();
  if (!response.body) throw new Error("Downloading the stock photo failed (empty response).");
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
