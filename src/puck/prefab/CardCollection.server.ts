import { getDb } from "../../db/db.js";
import { pages } from "../../db/schema.js";
import { and, desc, eq } from "drizzle-orm";
import type { CardCollectionItem } from "./CardCollection.js";

export async function getTopContentItems(contentTypeId: string, limit: number): Promise<CardCollectionItem[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(pages)
    .where(and(eq(pages.state, 1), eq(pages.contentType, contentTypeId)))
    .orderBy(desc(pages.id))
    .limit(Math.max(1, Math.min(limit, 100)));

  return rows.map((row) => {
    const content = row.content as { root?: { props?: Record<string, unknown> } } | null;
    return { id: row.id, ...(content?.root?.props ?? {}) };
  });
}
