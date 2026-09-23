import type { Field, Fields } from "@puckeditor/core";
import { imageField } from "./component-fields/index.js";
import type { ContentTypeFieldDef, ContentTypeRecord } from "./content-types.js";
import { buildJsonLd, getContentTypeRecords } from "./content-types.js";
import type { ContentType } from "./index.js";

// Turns the stored definition of a content type (see ./content-types.ts) into the Puck `Fields`
// the editor actually renders. Split out from ./content-types.ts because `imageField` pulls in the
// media picker's React components, which server-side consumers (routing, the sitemap) have no use
// for.

export function toPuckField(def: ContentTypeFieldDef): Field {
  switch (def.type) {
    case "select":
    case "radio":
      return { type: def.type, label: def.label, options: def.options ?? [] } as Field;
    case "image":
      return { ...imageField, label: def.label } as Field;
    default:
      return { type: def.type, label: def.label } as Field;
  }
}

export function toPuckFields(defs: ContentTypeFieldDef[]): Fields {
  return Object.fromEntries(defs.map((def) => [def.name, toPuckField(def)])) as Fields;
}

// The runtime shape the editor components and the data-binding wrapper consume: a stored record
// with its fields inflated and its JSON-LD mapping wrapped back up as the callback content types
// used to declare by hand in the Puck config.
export function toContentType(record: ContentTypeRecord): ContentType {
  return {
    id: record.id,
    title: record.title,
    fields: toPuckFields(record.fields),
    ...(record.baseUrl ? { baseUrl: record.baseUrl } : {}),
    jsonLd: (props: Record<string, unknown>) => buildJsonLd(record.jsonLd, props),
  };
}

export function getContentTypes(): ContentType[] {
  return getContentTypeRecords().map(toContentType);
}

export function getContentType(id: string | undefined): ContentType | undefined {
  if (!id) return undefined;
  const record = getContentTypeRecords().find((candidate) => candidate.id === id);
  return record ? toContentType(record) : undefined;
}
