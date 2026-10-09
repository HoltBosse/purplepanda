import { eq } from "drizzle-orm";
import type { getDb } from "../db/db.js";
import { mediafolders } from "../db/schema.js";

// A folder is hidden if it (or any ancestor) has visibility -1. Computed in memory from a single
// query rather than a recursive CTE — the folder tree is small and this mirrors the same
// ancestor-walk approach used elsewhere (e.g. the delete route's descendant walk).
export async function getHiddenFolderIds(db: ReturnType<typeof getDb>): Promise<Set<string>> {
  const allFolders = await db
    .select({ id: mediafolders.id, parent: mediafolders.parent, visibility: mediafolders.visibility })
    .from(mediafolders)
    .where(eq(mediafolders.state, 1));

  const byId = new Map(allFolders.map((f) => [f.id, f]));
  const memo = new Map<string, boolean>();

  const isHidden = (id: string, visited: Set<string> = new Set()): boolean => {
    if (memo.has(id)) return memo.get(id)!;
    if (visited.has(id)) return false; // cycle guard
    visited.add(id);

    const folder = byId.get(id);
    if (!folder) return false;

    const hidden = folder.visibility === -1 || (folder.parent ? isHidden(folder.parent, visited) : false);
    memo.set(id, hidden);
    return hidden;
  };

  const hiddenIds = new Set<string>();
  for (const folder of allFolders) {
    if (isHidden(folder.id)) hiddenIds.add(folder.id);
  }
  return hiddenIds;
}
