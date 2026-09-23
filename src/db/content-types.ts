import { and, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { ContentTypeInput, ContentTypeRecord } from "../puck/content-types.js";
import { findBaseUrlOwner, normalizeBaseUrl, parseContentTypeFields, parseJsonLdConfig } from "../puck/content-types.js";
import { getContentTypeRows, invalidateContentTypesCache, invalidatePagesCache } from "./content-cache.js";
import { contentTypes } from "./schema.js";

type Db = NodePgDatabase<Record<string, unknown>>;

// Server-side access to the content types authored in /admin/settings. Everything here reads
// through the shared cache in ./content-cache.ts, so the list costs one query per worker rather
// than one per request.

function toRecord(row: {
  id: string;
  title: string;
  baseUrl: string | null;
  fields: unknown;
  jsonld: unknown;
}): ContentTypeRecord {
  return {
    id: row.id,
    title: row.title,
    baseUrl: row.baseUrl,
    fields: parseContentTypeFields(row.fields),
    jsonLd: parseJsonLdConfig(row.jsonld),
  };
}

export async function listContentTypes(db: Db): Promise<ContentTypeRecord[]> {
  const rows = await getContentTypeRows(db);
  return rows.map(toRecord);
}

export async function getContentTypeById(db: Db, id: string | undefined): Promise<ContentTypeRecord | undefined> {
  if (!id) return undefined;
  const records = await listContentTypes(db);
  return records.find((record) => record.id === id);
}

// Matches a public request path against every content type that publishes under a base URL:
// `{baseUrl}/{alias}` resolves to the item of that type whose `alias` root prop matches. Nested
// aliases aren't routable — a content item is always one segment below its base URL.
export async function matchContentTypeRoute(
  db: Db,
  path: string,
): Promise<{ contentType: ContentTypeRecord; alias: string } | null> {
  for (const contentType of await listContentTypes(db)) {
    if (!contentType.baseUrl) continue;
    const base = normalizeBaseUrl(contentType.baseUrl);
    if (!base || !path.startsWith(`${base}/`)) continue;
    const alias = path.slice(base.length + 1);
    if (alias && !alias.includes("/")) {
      return { contentType, alias };
    }
  }
  return null;
}

// Another live content type already publishing under this base URL, if any (see
// findBaseUrlOwner for the rule). A deleted type isn't listed, so it frees its base URL for reuse.
export async function findBaseUrlConflict(
  db: Db,
  baseUrl: string | null,
  exceptId?: string,
): Promise<ContentTypeRecord | undefined> {
  return findBaseUrlOwner(await listContentTypes(db), baseUrl, exceptId);
}

function toColumns(input: ContentTypeInput) {
  return {
    title: input.title,
    baseUrl: input.baseUrl ? normalizeBaseUrl(input.baseUrl) : null,
    fields: input.fields,
    jsonld: input.jsonLd,
  };
}

export async function createContentType(db: Db, input: ContentTypeInput): Promise<ContentTypeRecord> {
  const [row] = await db.insert(contentTypes).values(toColumns(input)).returning();

  invalidateContentTypesCache(db);

  if (!row) throw new Error("Failed to create content type");
  return toRecord(row);
}

// Only a live content type can be edited; a deleted one reads as not found. Items keep whatever
// they already store — a field renamed or removed here leaves its old value on each item, just no
// longer shown in the editor.
export async function updateContentType(
  db: Db,
  id: string,
  input: ContentTypeInput,
): Promise<ContentTypeRecord | undefined> {
  const [row] = await db
    .update(contentTypes)
    .set(toColumns(input))
    .where(and(eq(contentTypes.id, id), eq(contentTypes.state, 1)))
    .returning();

  invalidateContentTypesCache(db);

  return row ? toRecord(row) : undefined;
}

// A soft delete, matching every other table here: the row is kept with state -1 and its items are
// left untouched in `pages`. Everything that reads content types goes through listContentTypes(),
// which only returns live ones, so the type and its items drop out of the admin, public routing,
// the sitemap and every picker at once — and setting state back to 1 would restore it all as it
// was. Returns whether there was a live content type to delete.
export async function deleteContentType(db: Db, id: string): Promise<boolean> {
  const [row] = await db
    .update(contentTypes)
    .set({ state: -1 })
    .where(and(eq(contentTypes.id, id), eq(contentTypes.state, 1)))
    .returning({ id: contentTypes.id });

  invalidateContentTypesCache(db);
  // The item-by-alias cache is keyed per content type; nothing can reach this type's entries once
  // it's gone from the list above, but there's no reason to keep them around either.
  invalidatePagesCache(db);

  return Boolean(row);
}
