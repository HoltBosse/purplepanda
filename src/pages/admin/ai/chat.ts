import "dotenv/config";
import type { Config, Data } from "@puckeditor/core";
import type { APIContext } from "astro";
import { RateLimiterRes } from "rate-limiter-flexible";
import * as z from "zod";
import { postgresLimiter } from "../../../db/rate-limiter.js";
import { buildComponentCatalog } from "../../../puck/ai/catalog.js";
import { aiUnavailableReason } from "../../../puck/ai/enabled.server.js";
import { type Attachment, describeAiError, type HarnessEvent, runHarness } from "../../../puck/ai/harness.server.js";
import { withTemplateSlot } from "../../../puck/ai/template-slot-config.js";
import { filterConfigByLocation } from "../../../puck/index.js";
import { getDisabledComponents } from "../../../puck/site-components.server.js";
import externalPuckConfig from "../../../puck.config.js";

// The editors' AI tab (components/ai/AiPanel.tsx) posts one author turn here and reads back a
// stream of newline-delimited JSON events (see HarnessEvent) as the assistant works. Behind the
// admin session check in the middleware like every other /admin route.

const MAX_ATTACHMENTS = 4;
const MAX_PREVIEW_BYTES = 2 * 1024 * 1024;
const MAX_ORIGINAL_BYTES = 20 * 1024 * 1024;
const MAX_DOCUMENT_CHARS = 2_000_000;
const PREVIEW_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type PreviewType = (typeof PREVIEW_TYPES)[number];

// A preview's real format, from its leading bytes rather than the type the browser declared.
function sniffPreviewType(bytes: Uint8Array): PreviewType | null {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && ascii(1, 4) === "PNG") return "image/png";
  if (ascii(0, 4) === "GIF8") return "image/gif";
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

// Each turn is a handful of cheap model calls; these caps keep a runaway script or a stuck
// retry loop from running up the bill.
const perUserLimiter = postgresLimiter({ tableName: "purplepanda_rate_limits", keyPrefix: "ai_chat_user", points: 60, duration: 60 * 60 });
const perSiteLimiter = postgresLimiter({ tableName: "purplepanda_rate_limits", keyPrefix: "ai_chat_site", points: 1000, duration: 24 * 60 * 60 });

const payloadSchema = z.object({
  message: z.string().trim().min(1).max(8000),
  location: z.enum(["page", "form", "template"]),
  // The editor's page settings section of the catalog; the components are described server-side.
  rootCatalog: z.string().min(1).max(20_000),
  data: z.string().max(MAX_DOCUMENT_CHARS),
  selectedId: z.string().max(200).nullable(),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().trim().min(1).max(4000) }))
    .max(12),
  attachmentNames: z.array(z.string().max(200)).max(MAX_ATTACHMENTS),
  rootSchema: z.enum(["page", "form"]).nullable().default(null),
  attention: z
    .array(z.object({ componentId: z.string().max(200), componentType: z.string().max(200), field: z.string().max(200), message: z.string().max(500) }))
    .max(40)
    .default([]),
});

const dataSchema = z
  .object({
    content: z.array(z.unknown()).default([]),
    root: z.object({ props: z.record(z.string(), z.unknown()).optional() }).loose().default({ props: {} }),
  })
  .loose();

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

async function consume(limiter: ReturnType<typeof postgresLimiter>, key: string): Promise<boolean> {
  try {
    await limiter.consume(key);
    return true;
  } catch (error) {
    if (error instanceof RateLimiterRes) return false;
    throw error;
  }
}

export async function POST(context: APIContext): Promise<Response> {
  const unavailable = await aiUnavailableReason();
  if (unavailable) return json({ error: unavailable }, 403);
  const apiKey = process.env.CLAUDE_API_KEY!.trim();

  const userId = (await context.session?.get("userId")) as string | undefined;
  if (!userId) return json({ error: "Not signed in." }, 401);

  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    return json({ error: "Malformed request." }, 400);
  }

  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(String(form.get("payload") ?? ""));
  } catch {
    return json({ error: "Malformed request." }, 400);
  }
  const payload = payloadSchema.safeParse(rawPayload);
  if (!payload.success) return json({ error: "Malformed request." }, 400);

  let parsedData: unknown;
  try {
    parsedData = JSON.parse(payload.data.data);
  } catch {
    return json({ error: "Malformed document." }, 400);
  }
  const data = dataSchema.safeParse(parsedData);
  if (!data.success) return json({ error: "Malformed document." }, 400);

  const previews = form.getAll("preview[]");
  const originals = form.getAll("original[]");
  if (previews.length !== payload.data.attachmentNames.length || previews.length > MAX_ATTACHMENTS) {
    return json({ error: "Malformed attachments." }, 400);
  }

  const attachments: Attachment[] = [];
  for (const [i, preview] of previews.entries()) {
    if (!(preview instanceof File) || preview.size > MAX_PREVIEW_BYTES) return json({ error: "Attachment preview too large." }, 400);
    const bytes = new Uint8Array(await preview.arrayBuffer());
    const mediaType = sniffPreviewType(bytes);
    if (!mediaType) return json({ error: "Attachments must be JPEG, PNG, GIF or WebP images." }, 400);
    const original = originals[i];
    const usableOriginal =
      original instanceof File && original.size > 0 && original.size <= MAX_ORIGINAL_BYTES && original.type.startsWith("image/") ? original : null;
    attachments.push({
      name: payload.data.attachmentNames[i] ?? `image-${i + 1}`,
      preview: { mediaType, base64: Buffer.from(bytes).toString("base64") },
      original: usableOriginal,
    });
  }

  const tenantId = context.locals.tenant.id;
  if (!(await consume(perSiteLimiter, tenantId)) || !(await consume(perUserLimiter, `${tenantId}:${userId}`))) {
    return json({ error: "The AI assistant's usage limit has been reached. Try again later." }, 429);
  }

  const located = filterConfigByLocation(externalPuckConfig ?? {}, payload.data.location);
  const config = payload.data.location === "template" ? withTemplateSlot(located) : located;
  const disabledComponents = await getDisabledComponents();
  const catalog = buildComponentCatalog(config as Config, { disabled: disabledComponents });
  const encoder = new TextEncoder();
  const abort = new AbortController();
  context.request.signal.addEventListener("abort", () => abort.abort());

  const stream = new ReadableStream<Uint8Array>({
    // Started from inside the request (and so inside its tenant context — see middleware), so the
    // harness's media queries run as this site.
    start: async (controller) => {
      const emit = (event: HarnessEvent) => {
        if (abort.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // The client went away mid-stream.
        }
      };
      try {
        await runHarness({
          apiKey,
          catalog,
          rootCatalog: payload.data.rootCatalog,
          config,
          disabledComponents,
          data: data.data as unknown as Data,
          history: payload.data.history,
          message: payload.data.message,
          selectedId: payload.data.selectedId,
          rootSchema: payload.data.rootSchema,
          attention: payload.data.attention,
          attachments,
          userId,
          signal: abort.signal,
          emit,
        });
      } catch (error) {
        if (!abort.signal.aborted) {
          console.error("AI assistant request failed", error);
          emit({ type: "error", message: describeAiError(error) });
        }
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed by a disconnect.
        }
      }
    },
    cancel: () => abort.abort(),
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}
