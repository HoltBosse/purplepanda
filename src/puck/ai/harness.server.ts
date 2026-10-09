import Anthropic from "@anthropic-ai/sdk";
import type { Config, Data } from "@puckeditor/core";
import { and, desc, eq, ilike, isNull, notInArray, or } from "drizzle-orm";
import sharp from "sharp";
import * as z from "zod";
import { getDb } from "../../db/db.js";
import { media } from "../../db/schema.js";
import { getHiddenFolderIds } from "../../media/hidden-folders.js";
import { importStockPhoto, searchStockPhotos, stockPhotosEnabled } from "../../media/stock.server.js";
import { createMedia } from "../../media/upload.js";
import { getMediaStorage, storageKey } from "../../storage/index.js";
import { collectComponentNodes } from "../content-tree.js";
import { type ContentValidationError, validateContentTree } from "../validate-content.js";
import { AiUnavailableError, assertAiAvailable, recordAiSpend } from "./enabled.server.js";
import { ROOT_SCHEMAS, type RootSchemaName } from "./root-schemas.js";
import { findNode, insertNodes, moveNode, type NewNode, outline, ROOT_ID, readableProps, removeNodes, type Shapes, shapesFromConfig, updateProps } from "./tree.js";

// The AI assistant behind the editors' AI tab (components/ai/AiPanel.tsx). One request is one
// author turn: the model sees the component catalog, a compact outline of the current document
// and the author's message (plus any attached images), then edits a server-side copy of the
// document through tools until it's done. The edited document goes back to the editor, which
// applies it as a single undoable change.
//
// Kept cheap on purpose: Claude Haiku 5.5 at low effort; the document is sent as a
// one-line-per-component outline rather than full JSON, with props fetched on demand; edits are
// small targeted tool calls rather than a rewritten document; earlier turns are replayed as plain
// text only; and the static prefix (tools, instructions, catalog) plus the growing tool loop are
// prompt-cached.

export const AI_MODEL = "claude-haiku-5-5";

// Claude Haiku 5.5 list prices, USD per million tokens — for the cost shown to the author. A call
// whose prompt (cached or not) runs past 100k tokens is billed at the higher tier.
const PRICE = { input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01 };
const LONG_PROMPT_PRICE = { input: 0.5, output: 2.5, cacheWrite: 0.625, cacheRead: 0.05 };
const LONG_PROMPT_TOKENS = 100_000;

const MAX_TOKENS = 8192;
// Model calls per author turn. A typical edit takes 2-3; building a whole page a few more.
const MAX_STEPS = 10;
const MEDIA_RESULTS = 12;
// Search results come with a thumbnail of each image so the assistant can choose by what the
// image shows rather than its file name. At this size each one is a few dozen tokens.
const THUMBNAIL_EDGE = 192;

export type ChatTurn = { role: "user" | "assistant"; text: string };

export type Attachment = {
  name: string;
  // Downscaled copy the model looks at.
  preview: { mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; base64: string };
  // The original file, saved to the media library only if the model decides to use it.
  original: File | null;
};

export type Usage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
};

export type HarnessEvent =
  | { type: "status"; text: string }
  | { type: "text"; text: string }
  | { type: "data"; data: Data }
  | { type: "usage"; usage: Usage }
  | { type: "error"; message: string };

export type HarnessInput = {
  apiKey: string;
  // The component catalog (see ./catalog.ts), built on the server — it goes into the system prompt.
  catalog: string;
  // The editor's page settings section of the catalog (see buildRootCatalog). Sent by the browser,
  // so it rides in the author's own turn rather than the system prompt.
  rootCatalog?: string | undefined;
  // The server's own config for this editor's location, for slots, defaults and validation.
  config: Partial<Config>;
  disabledComponents: ReadonlySet<string>;
  data: Data;
  history: ChatTurn[];
  message: string;
  selectedId: string | null;
  // Which page-settings schema the editor validates with (see ./root-schemas.ts), if a known one.
  rootSchema: RootSchemaName | null;
  // What the editor's "fields need attention" badge currently lists.
  attention: ContentValidationError[];
  attachments: Attachment[];
  userId: string;
  signal?: AbortSignal;
  emit: (event: HarnessEvent) => void;
};

const INSTRUCTIONS = `You are the AI assistant built into the visual page editor of PurplePanda, a CMS. Authors ask you to build, restyle or rewrite the page they're editing, and you make those changes directly with your tools.

How the document works:
- A page is a tree of components. The top level is the "content" slot of the pseudo-component "root"; components with slot props (e.g. Section.content) hold children.
- Each turn you get an outline of the current document: one line per component with its type, id and a short preview of its text. Call get_props for a component's full props before editing values you can't see.
- Only use component types and props listed in the component reference. Props you leave out take the component's defaults, so pass only what you want to differ.
- Theme props (color schemes, button styles, text styles, borders) take the ids listed in the reference, never raw colors or CSS.
- Rich text props are HTML. Use semantic markup (h2/h3 for headings inside sections, p, ul/ol, strong, a). No inline styles, scripts or classes.
- Images: image props take a media library reference. Find existing images with search_media, which shows a thumbnail of each — look at them and pick images whose content fits, and write alt text describing what the image actually shows. To use an image the author attached, call save_attachment first. When the library has nothing suitable and the stock photo tools are available, find one with search_stock_photos and bring it in with import_stock_photo. Never invent media ids or image URLs.
- In a template, the TemplateSlot component marks where each page's own content goes. Never remove it.
- In a form, inputs are the field components; a Button there is the form's submit button.

Page design guidance (use whichever of these components the reference offers):
- Build pages as a stack of full-width Sections, each with one purpose: a hero, features, testimonials, FAQ, a call to action. Give the hero and the closing call to action a stronger color scheme than the body sections, and vary schemes between neighbouring sections so they read as distinct bands.
- Keep a heading together with its paragraphs and lists in one rich-text component ("<h2>Title</h2><p>…</p>") instead of a separate component per paragraph.
- Use one h1 per page, normally in the hero; h2 for section titles; h3 for card or column titles.
- Lay side-by-side items (features, team members, pricing tiers) out in a Grid with one column on mobile, each item in a Card when it should look like a separate tile.
- Buttons get short action labels ("Book a table", "Get started"). Link internal pages with root-relative paths such as /contact; use full https:// URLs only for other sites.
- Give every image alt text that describes what it shows; leave decorative images' alt short.
- Match the tone and language of the existing page when adding to it.

Accessibility and SEO:
- Keep heading levels in order — don't jump from h2 to h4 — and never use a heading just to make text big.
- Link and button text should make sense on its own; avoid "click here" and "read more" without context.
- Keep paragraphs to two to four sentences so pages are easy to scan, and use lists for sets of three or more items.
- When asked to fill in page settings, write a specific title under 60 characters and, where there is an alias/slug field, lowercase words joined by hyphens.
- Don't put essential text only inside images; repeat it in the page copy.

Example — a features section built in a single call:
add_components {"parent": "root", "components": [{"type": "Section", "props": {"scheme": "<scheme id>"}, "slots": {"content": [
  {"type": "Rich", "props": {"content": "<h2>Why neighbours love us</h2><p>Small-batch baking, every morning since 1998.</p>"}},
  {"type": "Grid", "props": {"layout": {"desktop": {"columns": 3, "gap": 4}, "tablet": {"columns": 3, "gap": 4}, "mobile": {"columns": 1, "gap": 4}, "tabletCustomized": false, "mobileCustomized": true}}, "slots": {"content": [
    {"type": "Card", "slots": {"content": [{"type": "Rich", "props": {"content": "<h3>Baked at dawn</h3><p>Loaves come out of the oven at 6am.</p>"}}]}},
    {"type": "Card", "slots": {"content": [{"type": "Rich", "props": {"content": "<h3>Local flour</h3><p>Milled twenty miles away.</p>"}}]}},
    {"type": "Card", "slots": {"content": [{"type": "Rich", "props": {"content": "<h3>Made to order</h3><p>Cakes for every occasion.</p>"}}]}}
  ]}}
]}}]}

Editing existing content:
- To change text inside a rich-text prop, read it with get_props, then send the complete new HTML for that prop.
- You can call several tools in one response and they run in order — e.g. update every button in one go, or remove the old top-level components and add their replacements together.
- Reorder with move_component rather than removing and re-adding, which would lose ids and settings the author chose.
- To duplicate a component, read it with get_props and add a new one with the same props (and children).
- Keep the author's existing images, links and theme choices unless asked to change them.

How to work:
- Make the change in as few tool calls as possible: add_components takes a whole nested tree, so build a section with all its children in one call.
- When the author refers to "this", "it" or "the selected component", they mean the selected component given with their message.
- <needs_attention> lists the fields the editor currently flags as invalid (what its "fields need attention" badge counts); the page can't be saved until they're fixed. When asked to fix them, fix exactly those: "root" means page settings (update_props with id "root"), anything else is a component id. Fill required values from the page's own content — e.g. derive a missing alias from the title, find a fitting image with search_media for a missing one — and only ask the author for things you can't reasonably infer.
- Write real, specific copy that fits the page — never lorem ipsum or "[placeholder]" text — unless asked for placeholders.
- Don't remove or rewrite content the author didn't ask you to touch.
- If the request is unclear or impossible with the available components, ask a short question or explain instead of guessing.
- When finished, reply with one or two short sentences saying what you changed. No markdown headings, no lists of ids.`;

// Plain nested objects rather than a recursive $ref: with a self-referencing schema the model
// sometimes gave up on structure and sent the whole tree as one (often malformed) JSON string.
const nodeSchema = {
  type: "object",
  description: "A component: its type, the props that differ from its defaults, and optionally children per slot",
  properties: {
    type: { type: "string", description: "Component type from the reference" },
    props: { type: "object", description: "Props that differ from the component's defaults" },
    slots: {
      type: "object",
      description: 'Children per slot prop, each child shaped like this component, e.g. {"content": [{"type": "Rich", "props": {...}}]}',
      additionalProperties: { type: "array", items: { type: "object" } },
    },
  },
  required: ["type"],
};

const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_props",
    description: "Read the full props of one or more components (slot props list child ids). Use id \"root\" for page settings.",
    input_schema: {
      type: "object",
      properties: { ids: { type: "array", items: { type: "string" }, minItems: 1 } },
      required: ["ids"],
    },
  },
  {
    name: "add_components",
    description:
      "Insert new components (each optionally with nested children) into a slot. parent is a component id or \"root\" for the page's top level; slot defaults to the parent's first slot; index defaults to the end. Returns the new ids.",
    input_schema: {
      type: "object",
      properties: {
        parent: { type: "string" },
        slot: { type: "string" },
        index: { type: "integer", minimum: 0 },
        components: { type: "array", items: nodeSchema, minItems: 1 },
      },
      required: ["parent", "components"],
    },
  },
  {
    name: "update_props",
    description:
      "Change props of an existing component (or \"root\" for page settings). Objects merge key by key; arrays and other values replace. Slot props can't be set here.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" }, props: { type: "object" } },
      required: ["id", "props"],
    },
  },
  {
    name: "move_component",
    description: "Move a component (with its children) to another slot or position.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        parent: { type: "string" },
        slot: { type: "string" },
        index: { type: "integer", minimum: 0 },
      },
      required: ["id", "parent"],
    },
  },
  {
    name: "remove_components",
    description: "Delete components and everything inside them.",
    input_schema: {
      type: "object",
      properties: { ids: { type: "array", items: { type: "string" }, minItems: 1 } },
      required: ["ids"],
    },
  },
  {
    name: "search_media",
    description:
      "Search the site's media library by title or alt text; an empty query lists the newest images. Returns up to 12 images per page, each as a reference for image props followed by its thumbnail. File names are often meaningless, so judge images by their thumbnails — browse with an empty query and further pages when a keyword search finds nothing suitable.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string" }, page: { type: "integer", minimum: 1 } },
      required: ["query"],
    },
  },
  {
    name: "save_attachment",
    description: "Save an image the author attached to this message into the media library, returning a reference for image props.",
    input_schema: {
      type: "object",
      properties: {
        attachment: { type: "integer", minimum: 1, description: "1-based attachment number" },
        title: { type: "string", description: "Short descriptive title" },
        alt: { type: "string", description: "Alt text describing the image for screen readers" },
      },
      required: ["attachment", "title", "alt"],
    },
  },
];

// Only offered when stock photos are configured (see media/stock.server.ts).
const STOCK_TOOLS: Anthropic.Tool[] = [
  {
    name: "search_stock_photos",
    description:
      "Search free stock photos (Pexels) when the media library has nothing suitable. Returns up to 10 photos, each with its stock id and a thumbnail. Results aren't in the library until imported.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "What the photo should show, in English" }, page: { type: "integer", minimum: 1 } },
      required: ["query"],
    },
  },
  {
    name: "import_stock_photo",
    description: "Import a stock photo into the site's media library, returning a reference for image props. Only import photos you're going to use.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Stock id from search_stock_photos" },
        title: { type: "string", description: "Short descriptive title" },
        alt: { type: "string", description: "Alt text describing what the photo shows" },
      },
      required: ["id", "title", "alt"],
    },
  },
];

// Breakpoint on the last tool definition: tools render first, so this caches them on their own.
// The set only changes with configuration, so it stays cacheable.
function toolsFor(stock: boolean): Anthropic.Tool[] {
  const tools = stock ? [...TOOLS, ...STOCK_TOOLS] : TOOLS;
  return tools.map((tool, i) => (i === tools.length - 1 ? { ...tool, cache_control: { type: "ephemeral" } } : tool));
}

function toImageRef(row: { id: string; title: string; alt: string }) {
  return { id: row.id, title: row.title, alt: row.alt, width: null, height: null, objectPosition: null, crop: null };
}

function errorKey(error: ContentValidationError): string {
  return `${error.componentId}|${error.field}|${error.message}`;
}

function describeErrors(errors: ContentValidationError[]): string {
  return errors.map((e) => `- ${e.componentType} ${e.componentId} — ${e.field}: ${e.message}`).join("\n");
}

type ToolContext = {
  data: Data;
  shapes: Shapes;
  attachments: Attachment[];
  saved: Map<number, ReturnType<typeof toImageRef>>;
  // Media ids the assistant may put into image props: those already in the document, and those
  // search_media or save_attachment handed it this turn.
  knownMedia: Set<string>;
  userId: string;
};

type ToolOutcome = { result: string | Exclude<Anthropic.ToolResultBlockParam["content"], undefined>; changed: boolean; status: string };

// Media references inside a value — objects carrying an id, title and alt, like ImageConfig. Only
// looked for below a component's own props object, never at it, so a component's own id isn't
// mistaken for one.
export function mediaIdsIn(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) mediaIdsIn(item, out);
  } else if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.id === "string" && "title" in obj && "alt" in obj) out.push(obj.id);
    for (const child of Object.values(obj)) mediaIdsIn(child, out);
  }
  return out;
}

function specMediaIds(specs: NewNode[], out: string[] = []): string[] {
  for (const spec of specs) {
    mediaIdsIn(Object.values(spec.props ?? {}), out);
    for (const children of Object.values(spec.slots ?? {})) specMediaIds(children, out);
  }
  return out;
}

// A media id the assistant made up (or mistyped) would render as a broken image, so edits that
// carry one are refused before they touch the document, and the assistant is told why.
function assertKnownMedia(ids: string[], ctx: ToolContext): void {
  const unknown = [...new Set(ids.filter((id) => !ctx.knownMedia.has(id)))];
  if (unknown.length) {
    throw new Error(`Unknown media id ${unknown.join(", ")}. Image props only take references returned by search_media or save_attachment — nothing was changed.`);
  }
}

// The model occasionally sends a nested array or object as a JSON string; accept either form
// rather than spending a round trip on the error.
function parseIfJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (!text.startsWith("[") && !text.startsWith("{")) return value;
  // Deeply nested trees sometimes come back with a closing bracket too many at the end, which is
  // why the API handed the argument over as a string in the first place. Trailing closers are the
  // only repair attempted, since that one is unambiguous.
  for (let end = text.length; end > 0 && text.length - end <= 8; end--) {
    if (end < text.length && !"]}".includes(text.charAt(end))) break;
    try {
      return JSON.parse(text.slice(0, end));
    } catch {
      // Try again with the last closer dropped.
    }
  }
  return value;
}

function asObject(value: unknown, what: string): Record<string, unknown> {
  const parsed = parseIfJson(value ?? {});
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${what} must be an object.`);
  return parsed as Record<string, unknown>;
}

export function asSpecs(value: unknown): NewNode[] {
  const parsed = parseIfJson(value);
  // A lone component object is taken as a list of one.
  const list = parsed && typeof parsed === "object" && !Array.isArray(parsed) && "type" in parsed ? [parsed] : parsed;
  if (!Array.isArray(list)) {
    throw new Error(`components must be an array of components, got: ${String(JSON.stringify(parsed)).slice(0, 120)}`);
  }
  return list.map((item) => {
    const spec = asObject(item, "Each component");
    if (typeof spec.type !== "string" || !spec.type || spec.type.length > 200) throw new Error("Each component needs a type from the reference.");
    const slots = spec.slots === undefined ? undefined : asObject(spec.slots, "slots");
    return {
      type: spec.type,
      props: spec.props === undefined ? undefined : asObject(spec.props, "props"),
      slots: slots && Object.fromEntries(Object.entries(slots).map(([name, children]) => [name, asSpecs(children)])),
    };
  });
}

async function thumbnail(id: string): Promise<string | null> {
  try {
    const source = await getMediaStorage().readToBuffer(storageKey(id));
    const jpeg = await sharp(source)
      .rotate()
      .resize(THUMBNAIL_EDGE, THUMBNAIL_EDGE, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 70 })
      .toBuffer();
    return jpeg.toString("base64");
  } catch {
    return null;
  }
}

// Tool inputs come from the model, which reads text the author didn't write (page content, stock
// photo descriptions, attached images), so each is parsed like any other untrusted input. Optional
// values the model sends as null count as left out.
const idSchema = z.string().min(1).max(200);
const optional = <T extends z.ZodType>(schema: T) => schema.nullish().transform((value) => value ?? undefined);
const idList = z.preprocess((value) => {
  const parsed = parseIfJson(value);
  return typeof parsed === "string" ? [parsed] : parsed;
}, z.array(idSchema).min(1).max(200));
const pageNumber = z.coerce.number().int().min(1).max(100).nullish().transform((value) => value ?? 1);
const labelText = z.string().max(1000).nullish().transform((value) => value?.trim() ?? "");

const TOOL_INPUTS = {
  get_props: z.object({ ids: idList }),
  add_components: z.object({ parent: idSchema, slot: optional(idSchema), index: optional(z.coerce.number().int().min(0)), components: z.unknown() }),
  update_props: z.object({ id: idSchema, props: z.unknown() }),
  move_component: z.object({ id: idSchema, parent: idSchema, slot: optional(idSchema), index: optional(z.coerce.number().int().min(0)) }),
  remove_components: z.object({ ids: idList }),
  search_media: z.object({ query: z.string().max(200).nullish().transform((value) => value?.trim() ?? ""), page: pageNumber }),
  save_attachment: z.object({ attachment: z.coerce.number().int().min(1).max(100), title: labelText, alt: labelText }),
  search_stock_photos: z.object({ query: z.string().trim().min(1).max(200), page: pageNumber }),
  import_stock_photo: z.object({ id: z.coerce.string().regex(/^\d{1,20}$/, "must be a stock id from search_stock_photos"), title: labelText, alt: labelText }),
} as const;

type ToolName = keyof typeof TOOL_INPUTS;

function parseToolInput<N extends ToolName>(name: N, input: unknown): z.infer<(typeof TOOL_INPUTS)[N]> {
  const parsed = TOOL_INPUTS[name].safeParse(input ?? {});
  if (!parsed.success) throw new Error(`Invalid ${name} input:\n${z.prettifyError(parsed.error)}`);
  return parsed.data as z.infer<(typeof TOOL_INPUTS)[N]>;
}

async function runTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<ToolOutcome> {
  const { data, shapes } = ctx;
  if (!Object.hasOwn(TOOL_INPUTS, name)) throw new Error(`Unknown tool ${name}.`);
  switch (name as ToolName) {
    case "get_props": {
      const { ids } = parseToolInput("get_props", rawInput);
      const out: Record<string, unknown> = {};
      for (const id of ids) {
        if (id === ROOT_ID) {
          out[id] = (data.root as { props?: unknown } | undefined)?.props ?? {};
          continue;
        }
        const found = findNode(data, shapes, id);
        out[id] = found ? { type: found.node.type, props: readableProps(found.node, shapes) } : "not found";
      }
      return { result: JSON.stringify(out), changed: false, status: "Reading components" };
    }
    case "add_components": {
      const input = parseToolInput("add_components", rawInput);
      const specs = asSpecs(input.components);
      assertKnownMedia(specMediaIds(specs), ctx);
      const ids = insertNodes(data, shapes, input.parent, input.slot, input.index, specs);
      return {
        result: `Added: ${ids.join(", ")}`,
        changed: true,
        status: `Adding ${ids.length} component${ids.length === 1 ? "" : "s"}`,
      };
    }
    case "update_props": {
      const input = parseToolInput("update_props", rawInput);
      const patch = asObject(input.props, "props");
      assertKnownMedia(mediaIdsIn(Object.values(patch)), ctx);
      const ignored = updateProps(data, shapes, input.id, patch);
      return {
        result: ignored.length ? `Updated, except slot props ${ignored.join(", ")} (use add/move/remove).` : "Updated.",
        changed: true,
        status: "Updating props",
      };
    }
    case "move_component": {
      const input = parseToolInput("move_component", rawInput);
      moveNode(data, shapes, input.id, input.parent, input.slot, input.index);
      return { result: "Moved.", changed: true, status: "Moving a component" };
    }
    case "remove_components": {
      const { ids } = parseToolInput("remove_components", rawInput);
      const missing = removeNodes(data, shapes, ids);
      return {
        result: missing.length ? `Removed, except not found: ${missing.join(", ")}` : "Removed.",
        changed: missing.length < ids.length,
        status: `Removing ${ids.length} component${ids.length === 1 ? "" : "s"}`,
      };
    }
    case "search_media": {
      const { query, page } = parseToolInput("search_media", rawInput);
      const db = getDb();
      // Images in hidden folders aren't served publicly, so they're left out, as in the editor's
      // own image picker (see admin/media/api/lookup.ts).
      const hidden = await getHiddenFolderIds(db);
      const rows = await db
        .select({ id: media.id, title: media.title, alt: media.alt })
        .from(media)
        .where(
          and(
            eq(media.state, 1),
            hidden.size > 0 ? or(isNull(media.folder), notInArray(media.folder, [...hidden])) : undefined,
            query ? or(ilike(media.title, `%${query}%`), ilike(media.alt, `%${query}%`)) : undefined,
          ),
        )
        .orderBy(desc(media.createdAt), media.id)
        .limit(MEDIA_RESULTS)
        .offset((page - 1) * MEDIA_RESULTS);
      const status = query ? `Searching media for “${query}”` : "Browsing media";
      if (rows.length === 0) return { result: page > 1 ? "No more images." : "No images found.", changed: false, status };

      const thumbnails = await Promise.all(rows.map((row) => thumbnail(row.id)));
      const blocks: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[] = [];
      for (const [i, row] of rows.entries()) {
        ctx.knownMedia.add(row.id);
        blocks.push({ type: "text", text: `${i + 1}. ${JSON.stringify(toImageRef(row))}` });
        const preview = thumbnails[i];
        blocks.push(preview ? { type: "image", source: { type: "base64", media_type: "image/jpeg", data: preview } } : { type: "text", text: "(no preview)" });
      }
      if (rows.length === MEDIA_RESULTS) blocks.push({ type: "text", text: `More may exist: page ${page + 1}.` });
      return { result: blocks, changed: false, status };
    }
    case "save_attachment": {
      const input = parseToolInput("save_attachment", rawInput);
      const index = input.attachment;
      const existing = ctx.saved.get(index);
      if (existing) return { result: JSON.stringify(existing), changed: false, status: "Using attachment" };
      const attachment = ctx.attachments[index - 1];
      if (!attachment) throw new Error(`There is no attachment ${index}.`);
      const file =
        attachment.original ??
        new File([Buffer.from(attachment.preview.base64, "base64")], attachment.name, { type: attachment.preview.mediaType });
      const title = input.title.slice(0, 255) || attachment.name;
      const alt = input.alt.slice(0, 255) || title;
      const [created] = await createMedia([{ file, title, alt, folder: null }], ctx.userId);
      if (!created) throw new Error("Saving the image failed.");
      const ref = toImageRef(created);
      ctx.saved.set(index, ref);
      ctx.knownMedia.add(ref.id);
      return { result: JSON.stringify(ref), changed: false, status: "Saving image to the media library" };
    }
    case "search_stock_photos": {
      if (!stockPhotosEnabled()) throw new Error("Stock photos aren't available.");
      const { query, page } = parseToolInput("search_stock_photos", rawInput);
      const photos = await searchStockPhotos(query, page);
      const status = `Searching stock photos for “${query}”`;
      if (photos.length === 0) return { result: "No stock photos found.", changed: false, status };
      const blocks: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[] = [];
      for (const [i, photo] of photos.entries()) {
        blocks.push({ type: "text", text: `${i + 1}. stock id ${photo.id} (${photo.width}×${photo.height}) by ${photo.photographer}: ${photo.description}` });
        blocks.push({ type: "image", source: { type: "url", url: photo.thumbnailUrl } });
      }
      return { result: blocks, changed: false, status };
    }
    case "import_stock_photo": {
      if (!stockPhotosEnabled()) throw new Error("Stock photos aren't available.");
      const input = parseToolInput("import_stock_photo", rawInput);
      const created = await importStockPhoto({ id: input.id, title: input.title || "Stock photo", alt: input.alt, userId: ctx.userId });
      const ref = toImageRef(created);
      ctx.knownMedia.add(ref.id);
      return { result: JSON.stringify(ref), changed: false, status: "Importing a stock photo" };
    }
  }
}

// Adds one call's usage to the turn's total and returns that call's cost.
function addUsage(total: Usage, usage: Anthropic.Usage): number {
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const price = usage.input_tokens + cacheRead + cacheWrite > LONG_PROMPT_TOKENS ? LONG_PROMPT_PRICE : PRICE;
  total.inputTokens += usage.input_tokens;
  total.outputTokens += usage.output_tokens;
  total.cacheReadTokens += cacheRead;
  total.cacheWriteTokens += cacheWrite;
  const cost =
    (usage.input_tokens * price.input + usage.output_tokens * price.output + cacheRead * price.cacheRead + cacheWrite * price.cacheWrite) /
    1_000_000;
  total.costUsd += cost;
  return cost;
}

// One cache breakpoint rides on the newest message, so each step of the tool loop re-reads
// everything before it from cache. Earlier ones are dropped to stay within the four allowed.
function withRollingBreakpoint(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  return messages.map((message, i) => {
    if (i !== messages.length - 1 || typeof message.content === "string") return message;
    const content = message.content.map((block, j) =>
      j === message.content.length - 1 ? ({ ...block, cache_control: { type: "ephemeral" } } as Anthropic.ContentBlockParam) : block,
    );
    return { ...message, content };
  });
}

export async function runHarness(input: HarnessInput): Promise<void> {
  const { emit } = input;
  const client = new Anthropic({ apiKey: input.apiKey, maxRetries: 2 });
  const shapes = shapesFromConfig(input.config);
  const data = structuredClone(input.data);
  const knownMedia = new Set(
    mediaIdsIn([
      Object.values((data.root as { props?: Record<string, unknown> } | undefined)?.props ?? {}),
      collectComponentNodes(data.content).map((node) => Object.values(node.props)),
    ]),
  );
  const ctx: ToolContext = { data, shapes, attachments: input.attachments, saved: new Map(), knownMedia, userId: input.userId };
  const usage: Usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0 };

  const rootPropsSchema = input.rootSchema ? ROOT_SCHEMAS[input.rootSchema] : undefined;
  const validate = () => validateContentTree(input.config, data, { rootPropsSchema, disabledComponents: input.disabledComponents });
  // Problems the document already had aren't the assistant's to fix unasked.
  const preexisting = new Set(validate().map(errorKey));
  const flagged = new Set(input.attention.map(errorKey));

  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: INSTRUCTIONS },
    { type: "text", text: `# Component reference\n\n${input.catalog}`, cache_control: { type: "ephemeral" } },
  ];

  const selected = input.selectedId ? findNode(data, shapes, input.selectedId) : null;
  const turnText = [
    `<document>\n${outline(data, shapes)}\n</document>`,
    selected ? `<selected>${selected.node.type} id=${input.selectedId}</selected>` : "<selected>none</selected>",
    input.attention.length
      ? `<needs_attention>\n${input.attention.map((e) => `- ${e.componentId === ROOT_ID ? "root (page settings)" : `${e.componentType} id=${e.componentId}`} — ${e.field}: ${e.message}`).join("\n")}\n</needs_attention>`
      : "",
    input.rootCatalog ? `<page_settings_reference>\n${input.rootCatalog}\n</page_settings_reference>` : "",
    input.attachments.length ? `<attachments>${input.attachments.map((a, i) => `${i + 1}: ${a.name}`).join(", ")}</attachments>` : "",
    `<request>\n${input.message}\n</request>`,
  ]
    .filter(Boolean)
    .join("\n");

  const messages: Anthropic.MessageParam[] = [
    ...input.history.map((turn): Anthropic.MessageParam => ({ role: turn.role, content: turn.text })),
    {
      role: "user",
      content: [
        ...input.attachments.map(
          (a): Anthropic.ImageBlockParam => ({ type: "image", source: { type: "base64", media_type: a.preview.mediaType, data: a.preview.base64 } }),
        ),
        { type: "text", text: turnText },
      ],
    },
  ];

  let changed = false;
  let checkedValidation = false;
  let finalText = "";

  for (let step = 0; step < MAX_STEPS; step++) {
    if (input.signal?.aborted) return;
    await assertAiAvailable();
    const response = await client.messages.create(
      {
        model: AI_MODEL,
        max_tokens: MAX_TOKENS,
        // Low effort keeps each step short. Thinking stays on: turning it off saves only a few
        // percent of output here, and models without it occasionally write a tool call as plain
        // text instead of making it, which would silently drop the author's edit.
        thinking: { type: "adaptive" },
        output_config: { effort: "low" },
        system,
        tools: toolsFor(stockPhotosEnabled()),
        messages: withRollingBreakpoint(messages),
      },
      input.signal ? { signal: input.signal } : undefined,
    );
    await recordAiSpend(addUsage(usage, response.usage));
    messages.push({ role: "assistant", content: response.content });

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
    const toolUses = response.content.filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");

    if (response.stop_reason === "refusal") {
      finalText = text || "I can't help with that request.";
      break;
    }

    if (response.stop_reason === "max_tokens" && toolUses.length === 0) {
      finalText = text || "That change was too large to make in one go — try asking for it in smaller parts.";
      break;
    }

    if (toolUses.length === 0) {
      // Before handing back, make sure the edits didn't leave anything invalid — the editor would
      // refuse to save it — and, once the assistant has edited, that the fields the author's badge
      // flagged are fixed. One follow-up at most, to bound cost; it may still explain rather than
      // fix, since some values only the author knows.
      const remaining = changed ? validate() : [];
      const introduced = remaining.filter((error) => !preexisting.has(errorKey(error)));
      const unresolved = remaining.filter((error) => flagged.has(errorKey(error)));
      if ((introduced.length > 0 || unresolved.length > 0) && !checkedValidation && step < MAX_STEPS - 1) {
        checkedValidation = true;
        emit({ type: "status", text: "Fixing validation problems" });
        const parts = [
          introduced.length ? `Your changes left these fields invalid, so the page can't be saved:\n${describeErrors(introduced)}` : "",
          unresolved.length ? `These flagged fields still need attention:\n${describeErrors(unresolved)}` : "",
        ].filter(Boolean);
        messages.push({ role: "user", content: `${parts.join("\n\n")}\n\nFix them, or explain briefly why you can't, then reply briefly.` });
        continue;
      }
      finalText = text;
      break;
    }

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const toolUse of toolUses) {
      try {
        const outcome = await runTool(toolUse.name, toolUse.input, ctx);
        changed ||= outcome.changed;
        emit({ type: "status", text: outcome.status });
        results.push({ type: "tool_result", tool_use_id: toolUse.id, content: outcome.result });
      } catch (error) {
        console.warn(`AI assistant tool ${toolUse.name} failed:`, error instanceof Error ? error.message : error);
        emit({ type: "status", text: "Retrying a step" });
        results.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: error instanceof Error ? error.message : "Tool failed.",
          is_error: true,
        });
      }
    }
    messages.push({ role: "user", content: results });

    if (step === MAX_STEPS - 1) finalText = text || "I stopped after making several changes — ask me to continue if there's more to do.";
  }

  if (changed) emit({ type: "data", data });
  emit({ type: "text", text: finalText || (changed ? "Done." : "I didn't make any changes.") });
  emit({ type: "usage", usage });
}

// An author-facing message for a failed assistant run. SDK and database errors can carry request
// ids, internal details or query text, so anything unrecognized gets a generic message (and is
// logged by the caller).
export function describeAiError(error: unknown): string {
  if (error instanceof AiUnavailableError) return error.message;
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return "The AI assistant's API key was rejected.";
  }
  if (error instanceof Anthropic.RateLimitError) return "The AI service is busy right now. Try again in a minute.";
  if (error instanceof Anthropic.APIConnectionError) return "Couldn't reach the AI service. Try again shortly.";
  if (error instanceof Anthropic.InternalServerError) return "The AI service had a problem. Try again shortly.";
  return "Something went wrong talking to the AI assistant.";
}
