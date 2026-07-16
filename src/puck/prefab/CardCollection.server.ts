import { getDb } from "../../db/db.js";
import { pages } from "../../db/schema.js";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { CardCollectionItem, OrderBy } from "./CardCollection.js";

export async function getTopContentItems(
  contentTypeId: string,
  limit: number,
  orderBy?: OrderBy,
  offset?: number,
): Promise<CardCollectionItem[]> {
  const db = getDb();
  const orderColumn = orderBy?.field ? sql`(${pages.content}->'root'->'props'->>${orderBy.field})` : pages.id;
  const orderFn = orderBy?.direction === "asc" ? asc : desc;

  const rows = await db
    .select()
    .from(pages)
    .where(and(eq(pages.state, 1), eq(pages.contentType, contentTypeId)))
    .orderBy(orderFn(orderColumn))
    .limit(Math.max(1, Math.min(limit, 100)))
    .offset(Math.max(0, offset ?? 0));

  return rows.map((row) => {
    const content = row.content as { root?: { props?: Record<string, unknown> } } | null;
    return { id: row.id, ...(content?.root?.props ?? {}) };
  });
}
