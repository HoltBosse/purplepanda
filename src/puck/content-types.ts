import type { Thing } from "schema-dts";
import * as z from "zod";

// A content type is a row in the `content_types` table (see db/schema.ts), authored in
// /admin/settings rather than in the site's Puck config. This module holds everything about that
// stored shape that both the server and the browser need — the JSON shapes, their validation, and
// the JSON-LD builder. Turning a record into actual Puck `Fields` needs the editor-only field
// components, so that lives in ./content-type-fields.tsx instead.

// Which field kinds an author can pick from when defining a content type. All but `image` are
// Puck's own built-in field types, used verbatim as the field's `type`; `image` maps to this
// package's `imageField` custom field. Extend both this list and toPuckField() in
// ./content-type-fields.tsx to offer more custom fields.
export const CONTENT_TYPE_FIELD_KINDS = [
  { kind: "text", label: "Text" },
  { kind: "textarea", label: "Textarea" },
  { kind: "richtext", label: "Rich text" },
  { kind: "number", label: "Number" },
  { kind: "select", label: "Select" },
  { kind: "radio", label: "Radio" },
  { kind: "image", label: "Image" },
] as const;

export type ContentTypeFieldKind = (typeof CONTENT_TYPE_FIELD_KINDS)[number]["kind"];

// Kinds whose editor UI is a fixed list of choices, so their definition must carry one.
export const KINDS_WITH_OPTIONS: ContentTypeFieldKind[] = ["select", "radio"];

// Root prop names ContentPuckEditor.tsx always supplies itself (title/alias, the scheduling
// window, notes and the Open Graph group). A content type field can't take one of these names —
// the editor drops same-named fields, so it would silently never appear.
export const RESERVED_FIELD_NAMES = ["title", "alias", "start", "end", "notes", "og", "id", "parentPage"];

const fieldOptionSchema = z.object({
  label: z.string().trim().min(1, "Option label is required"),
  value: z.string().trim().min(1, "Option value is required"),
});

export const contentTypeFieldSchema = z
  .object({
    // Used as the prop name on the content item's root props, so it has to be a plain identifier.
    name: z
      .string()
      .trim()
      .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, "Field name must start with a letter and contain only letters, numbers and underscores")
      .refine((name) => !RESERVED_FIELD_NAMES.includes(name), `That field name is reserved (${RESERVED_FIELD_NAMES.join(", ")})`),
    label: z.string().trim().min(1, "Field label is required"),
    type: z.enum(CONTENT_TYPE_FIELD_KINDS.map((k) => k.kind) as [ContentTypeFieldKind, ...ContentTypeFieldKind[]]),
    options: z.array(fieldOptionSchema).optional(),
  })
  .refine(
    (field) => !KINDS_WITH_OPTIONS.includes(field.type) || (field.options?.length ?? 0) > 0,
    { message: "Select and radio fields need at least one option", path: ["options"] },
  );

export type ContentTypeFieldDef = z.infer<typeof contentTypeFieldSchema>;

// A content type's structured-data configuration: the schema.org type its items are, plus which
// of the item's own fields supply which of that type's properties. Replaces the `jsonLd` callback
// content types used to declare in the Puck config — see buildJsonLd below for how it's applied.
export const jsonLdConfigSchema = z.object({
  type: z.string().trim().min(1),
  properties: z.record(z.string().trim().min(1), z.string()),
});

export type JsonLdConfig = z.infer<typeof jsonLdConfigSchema>;

export const contentTypeInputSchema = z.object({
  title: z.string().trim().min(1, "A title is required").max(255, "Title is too long"),
  // Stored as authored; normalizeBaseUrl() below strips slashes wherever it's matched or built on.
  baseUrl: z.string().trim().max(255, "Base URL is too long").nullable(),
  fields: z.array(contentTypeFieldSchema).superRefine((fields, ctx) => {
    const seen = new Set<string>();
    for (const field of fields) {
      if (seen.has(field.name)) {
        ctx.addIssue({ code: "custom", message: `Duplicate field name "${field.name}"` });
      }
      seen.add(field.name);
    }
  }),
  jsonLd: jsonLdConfigSchema.nullable(),
});

export type ContentTypeInput = z.infer<typeof contentTypeInputSchema>;

// One content type as every consumer sees it: the row's columns, parsed. Serializable, so the
// same object is handed to the browser (see components/ContentTypesScript.astro) as the server
// works with.
export type ContentTypeRecord = ContentTypeInput & { id: string };

// The Puck field `type` a stored kind renders as. Everything but `image` is a Puck built-in used
// verbatim; `image` renders as this package's `imageField`, which is a Puck custom field. Lets
// callers that only care about the type (e.g. the data-binding field filter) avoid building the
// whole field, which would pull the editor-only field components in with it.
export function puckFieldType(kind: ContentTypeFieldKind): string {
  return kind === "image" ? "custom" : kind;
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/^\/+|\/+$/g, "");
}

// Which of `records` (other than `exceptId`) already publishes under `baseUrl`. Two content types
// sharing one would collide in routing — whichever was matched first would claim every
// `{baseUrl}/{alias}` request, silently hiding the other's items. Only an exact match collides:
// `news` and `news/articles` can coexist, since an alias is always a single path segment.
export function findBaseUrlOwner(
  records: ContentTypeRecord[],
  baseUrl: string | null,
  exceptId?: string,
): ContentTypeRecord | undefined {
  const base = baseUrl ? normalizeBaseUrl(baseUrl) : "";
  if (!base) return undefined;
  return records.find(
    (record) => record.id !== exceptId && record.baseUrl !== null && normalizeBaseUrl(record.baseUrl) === base,
  );
}

// Builds a content item's schema.org representation from its resolved root props: the configured
// `@type`, plus every mapped property whose source field actually has a value. Returns a `Thing`
// minus `@context`, which [...path].astro adds and serializes into a
// `<script type="application/ld+json">` tag. A content type without a jsonLd config (or with one
// that maps nothing) emits no structured data of its own.
export function buildJsonLd(config: JsonLdConfig | null | undefined, props: Record<string, unknown>): Thing | undefined {
  if (!config?.type) return undefined;

  const entries = Object.entries(config.properties ?? {})
    .map(([property, sourceField]) => [property, sourceField ? props?.[sourceField] : undefined] as const)
    .filter(([, value]) => value !== undefined && value !== null && value !== "");

  if (entries.length === 0) return undefined;

  return { "@type": config.type, ...Object.fromEntries(entries) } as Thing;
}

// Parses whatever is stored in a row's jsonb columns, which predate — or postdate — any given
// version of the schemas above. Anything unparseable degrades to "no fields"/"no structured
// data" rather than taking down the page rendering it.
export function parseContentTypeFields(value: unknown): ContentTypeFieldDef[] {
  const result = z.array(contentTypeFieldSchema).safeParse(value);
  return result.success ? result.data : [];
}

export function parseJsonLdConfig(value: unknown): JsonLdConfig | null {
  if (value === null || value === undefined) return null;
  const result = jsonLdConfigSchema.safeParse(value);
  return result.success ? result.data : null;
}

// The content types the browser knows about. The server hands them over as a global (written by
// components/ContentTypesScript.astro, which every admin layout renders) rather than as props,
// because the code that needs them is deep inside the Puck config — a component's resolveFields,
// the data-binding wrapper — where no props reach.
export const CONTENT_TYPES_GLOBAL = "__PP_CONTENT_TYPES";

type GlobalWithContentTypes = typeof globalThis & { __PP_CONTENT_TYPES?: ContentTypeRecord[] };

let overrideRecords: ContentTypeRecord[] | null = null;

// Escape hatch for tests (and for server-side callers that already loaded the rows) to supply the
// records this module hands out without going through the injected global.
export function setContentTypeRecords(records: ContentTypeRecord[] | null): void {
  overrideRecords = records;
}

export function getContentTypeRecords(): ContentTypeRecord[] {
  if (overrideRecords) return overrideRecords;
  const injected = (globalThis as GlobalWithContentTypes).__PP_CONTENT_TYPES;
  return Array.isArray(injected) ? injected : [];
}
