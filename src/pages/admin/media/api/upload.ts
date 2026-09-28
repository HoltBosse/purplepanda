import type { APIContext } from "astro";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../../../db/db.js";
import { mediafolders } from "../../../../db/schema.js";
import { createMedia, MAX_UPLOAD_BYTES } from "../../../../media/upload.js";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

// JSON counterpart to ../upload.ts for the image picker (ImageField), which uploads with fetch and
// needs the created media back instead of a redirect. Everything goes into one folder (the one
// being browsed), so `folder` is a single optional value rather than one per file.
export async function POST(context: APIContext): Promise<Response> {
  const formData = await context.request.formData();
  const files = z.array(z.instanceof(File)).min(1).safeParse(formData.getAll("file[]"));
  const titles = z.array(z.string().trim().min(1).max(255)).safeParse(formData.getAll("title[]"));
  const alts = z.array(z.string().trim().min(1).max(255)).safeParse(formData.getAll("alt[]"));
  const folder = z.uuid().optional().safeParse(formData.get("folder") || undefined);

  if (!files.success || !titles.success || !alts.success || !folder.success
    || titles.data.length !== files.data.length || alts.data.length !== files.data.length) {
    return json({ error: "Each image needs a title and alt text." }, 400);
  }

  if (files.data.some((f) => !f.type.startsWith("image/"))) {
    return json({ error: "Only image files can be uploaded." }, 400);
  }

  if (files.data.some((f) => f.size > MAX_UPLOAD_BYTES)) {
    return json({ error: "Each file must be smaller than 512MB." }, 400);
  }

  if (folder.data) {
    const [existing] = await getDb()
      .select({ id: mediafolders.id })
      .from(mediafolders)
      .where(and(eq(mediafolders.id, folder.data), eq(mediafolders.state, 1)))
      .limit(1);
    if (!existing) {
      return json({ error: "The selected folder no longer exists." }, 400);
    }
  }

  const userId = await context.session?.get("userId");
  try {
    const images = await createMedia(
      files.data.map((file, i) => ({
        file,
        title: titles.data[i]!,
        alt: alts.data[i]!,
        folder: folder.data ?? null,
      })),
      userId,
    );
    return json({ images }, 201);
  } catch {
    return json({ error: "Failed to save the upload. Please try again." }, 500);
  }
}
