import { NO_BORDER, REPLACEABLE_KINDS, type ReplaceableKind } from "./types.js";

// How many documents (pages, templates, forms, prefabs, the 404 page, open drafts) reference each
// scheme, button variant, text style and border preset. Computed on demand by walking the stored content trees:
// component props live inside page content JSON, where no foreign key can reach them.

export type ThemeUsage = Record<ReplaceableKind, Record<string, number>>;

const TEXT_STYLE_ATTR = /data-text-style="([a-z0-9-]+)"/g;

export function emptyUsage(): ThemeUsage {
  return { scheme: {}, variant: {}, textStyle: {}, border: {} };
}

// Every id a single content tree references, by kind. Walks the whole value rather than Puck's
// known shape, so slots, zones and nested arrays are all covered.
export function referencedIds(content: unknown): Record<ReplaceableKind, Set<string>> {
  const found: Record<ReplaceableKind, Set<string>> = { scheme: new Set(), variant: new Set(), textStyle: new Set(), border: new Set() };
  const stack: unknown[] = [content];
  while (stack.length > 0) {
    const value = stack.pop();
    if (typeof value === "string") {
      // Rich text stores its HTML as a string; a paragraph given a text style carries it as
      // data-text-style (see puck/prefab/rich-text-style.ts).
      if (value.includes("data-text-style")) for (const m of value.matchAll(TEXT_STYLE_ATTR)) found.textStyle.add(m[1] as string);
      continue;
    }
    if (Array.isArray(value)) {
      stack.push(...value);
      continue;
    }
    if (typeof value !== "object" || value === null) continue;
    const obj = value as Record<string, unknown>;
    if (typeof obj.type === "string" && typeof obj.props === "object" && obj.props !== null) {
      const props = obj.props as Record<string, unknown>;
      for (const kind of REPLACEABLE_KINDS) {
        const id = props[kind];
        // "none" is a border prop's way of saying no border, not a preset.
        if (typeof id === "string" && id && !(kind === "border" && id === NO_BORDER)) found[kind].add(id);
      }
    }
    stack.push(...Object.values(obj));
  }
  return found;
}

export function countUsage(documents: Iterable<unknown>): ThemeUsage {
  const usage = emptyUsage();
  for (const content of documents) {
    const ids = referencedIds(content);
    for (const kind of REPLACEABLE_KINDS) {
      for (const id of ids[kind]) usage[kind][id] = (usage[kind][id] ?? 0) + 1;
    }
  }
  return usage;
}
