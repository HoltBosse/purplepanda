// Shared by the pages admin list (pages/admin/pages/index.astro) and the editor's parent page
// picker (pages/admin/pages/api/parents.ts), so both draw the parentPage hierarchy the same way.

export type TreeRow<T> = { page: T; depth: number };

export function groupByParent<T>(items: T[], parentOf: (item: T) => string | null | undefined): Map<string, T[]> {
  const childrenByParent = new Map<string, T[]>();
  for (const item of items) {
    const parentId = parentOf(item);
    if (!parentId) continue;
    const bucket = childrenByParent.get(parentId);
    if (bucket) bucket.push(item);
    else childrenByParent.set(parentId, [item]);
  }
  return childrenByParent;
}

// Depth-first: each root (depth 1) followed by its whole subtree. `visited` guards against a
// parent cycle, which nothing in the content document prevents.
export function flattenTree<T extends { id: string }>(roots: T[], childrenByParent: Map<string, T[]>): TreeRow<T>[] {
  const rows: TreeRow<T>[] = [];
  function addChildren(parentId: string, depth: number, visited: Set<string>) {
    for (const child of childrenByParent.get(parentId) ?? []) {
      if (visited.has(child.id)) continue;
      rows.push({ page: child, depth });
      addChildren(child.id, depth + 1, new Set(visited).add(child.id));
    }
  }
  for (const root of roots) {
    rows.push({ page: root, depth: 1 });
    addChildren(root.id, 2, new Set([root.id]));
  }
  return rows;
}

// `rootId` plus everything beneath it — a page can't be parented under itself or its own
// descendant without creating a cycle.
export function subtreeIds<T extends { id: string }>(rootId: string, childrenByParent: Map<string, T[]>): Set<string> {
  const ids = new Set([rootId]);
  const queue = [rootId];
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    for (const child of childrenByParent.get(id) ?? []) {
      if (ids.has(child.id)) continue;
      ids.add(child.id);
      queue.push(child.id);
    }
  }
  return ids;
}
