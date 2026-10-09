import type { ComponentData, Config, Data } from "@puckeditor/core";

// Pure edits to a Puck document for the AI assistant's tools (see ./harness.server.ts). Nested
// children live inline as arrays under `slot` props (see ../content-tree.ts), and the page's own
// top level is `data.content`, addressed here as the "content" slot of the pseudo-id "root".

export const ROOT_ID = "root";
export const ROOT_SLOT = "content";

export type ComponentShape = {
  // Slot prop names, in field order. The first is the default target when none is named.
  slots: string[];
  defaultProps: Record<string, unknown>;
};

export type Shapes = Record<string, ComponentShape>;

// A component the assistant asks to create: props over the component's defaults, plus children
// for its slots, nested to any depth.
export type NewNode = {
  type: string;
  props?: Record<string, unknown> | undefined;
  slots?: Record<string, NewNode[]> | undefined;
};

export function shapesFromConfig(config: Partial<Config>): Shapes {
  const shapes: Shapes = {};
  for (const [name, component] of Object.entries(config.components ?? {})) {
    const fields = (component.fields ?? {}) as Record<string, { type?: string }>;
    shapes[name] = {
      slots: Object.entries(fields)
        .filter(([, field]) => field?.type === "slot")
        .map(([key]) => key),
      defaultProps: (component.defaultProps ?? {}) as Record<string, unknown>,
    };
  }
  return shapes;
}

type Located = { node: ComponentData; list: ComponentData[]; index: number };

function isNode(value: unknown): value is ComponentData {
  return !!value && typeof value === "object" && typeof (value as ComponentData).type === "string" && !!(value as ComponentData).props;
}

function slotNamesOf(node: ComponentData, shapes: Shapes): string[] {
  const known = shapes[node.type]?.slots;
  if (known) return known;
  // A component this config doesn't know (e.g. removed from the site module): fall back to any
  // prop that holds components.
  return Object.entries(node.props).filter(([, v]) => Array.isArray(v) && v.length > 0 && v.every(isNode)).map(([k]) => k);
}

function childLists(node: ComponentData, shapes: Shapes): [string, ComponentData[]][] {
  return slotNamesOf(node, shapes).map((slot) => {
    const value = (node.props as Record<string, unknown>)[slot];
    return [slot, Array.isArray(value) ? (value as ComponentData[]) : []];
  });
}

export function findNode(data: Data, shapes: Shapes, id: string): Located | null {
  const search = (list: ComponentData[]): Located | null => {
    for (const [index, node] of list.entries()) {
      if (node.props.id === id) return { node, list, index };
      for (const [, children] of childLists(node, shapes)) {
        const found = search(children);
        if (found) return found;
      }
    }
    return null;
  };
  return search(data.content ?? []);
}

function isDescendant(node: ComponentData, shapes: Shapes, id: string): boolean {
  return childLists(node, shapes).some(([, children]) => children.some((child) => child.props.id === id || isDescendant(child, shapes, id)));
}

// The array a parent's slot holds, created if the slot is still unset.
function slotList(data: Data, shapes: Shapes, parentId: string, slot: string | undefined): ComponentData[] {
  if (parentId === ROOT_ID) {
    if (slot && slot !== ROOT_SLOT) throw new Error(`The root only has the "${ROOT_SLOT}" slot.`);
    data.content ??= [];
    return data.content;
  }
  const parent = findNode(data, shapes, parentId);
  if (!parent) throw new Error(`No component with id "${parentId}".`);
  const slots = slotNamesOf(parent.node, shapes);
  const name = slot ?? slots[0];
  if (!name || !slots.includes(name)) {
    throw new Error(`${parent.node.type} "${parentId}" has ${slots.length ? `slots ${slots.join(", ")}` : "no slots"}, not "${slot}".`);
  }
  const props = parent.node.props as Record<string, unknown>;
  if (!Array.isArray(props[name])) props[name] = [];
  return props[name] as ComponentData[];
}

function clampIndex(index: number | undefined, length: number): number {
  if (index === undefined || index < 0 || index > length) return length;
  return Math.floor(index);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

// Objects merge key by key (so `{ image: { position: "end" } }` keeps the image's file), while
// arrays and scalars replace outright.
export function deepMerge(target: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    out[key] = isPlainObject(value) && isPlainObject(out[key]) ? deepMerge(out[key] as Record<string, unknown>, value) : value;
  }
  return out;
}

export function newId(type: string): string {
  // Puck's own id format, so ids the assistant creates look like ones the editor creates.
  return `${type}-${crypto.randomUUID()}`;
}

export function buildNode(spec: NewNode, shapes: Shapes, created: string[] = []): ComponentData {
  const shape = shapes[spec.type];
  if (!shape) throw new Error(`Unknown component type "${spec.type}".`);
  const id = newId(spec.type);
  created.push(id);

  const { id: _ignored, ...props } = spec.props ?? {};
  const merged = deepMerge(structuredClone(shape.defaultProps), props);
  for (const slot of shape.slots) merged[slot] = [];
  for (const [slot, children] of Object.entries(spec.slots ?? {})) {
    if (!shape.slots.includes(slot)) {
      throw new Error(`${spec.type} has ${shape.slots.length ? `slots ${shape.slots.join(", ")}` : "no slots"}, not "${slot}".`);
    }
    merged[slot] = children.map((child) => buildNode(child, shapes, created));
  }
  return { type: spec.type, props: { ...merged, id } } as ComponentData;
}

export function insertNodes(data: Data, shapes: Shapes, parentId: string, slot: string | undefined, index: number | undefined, specs: NewNode[]): string[] {
  const created: string[] = [];
  // Built before touching the document, so one bad spec leaves it unchanged.
  const nodes = specs.map((spec) => buildNode(spec, shapes, created));
  const list = slotList(data, shapes, parentId, slot);
  list.splice(clampIndex(index, list.length), 0, ...nodes);
  return created;
}

export function updateProps(data: Data, shapes: Shapes, id: string, patch: Record<string, unknown>): string[] {
  const { id: _ignored, ...rest } = patch;
  if (id === ROOT_ID) {
    data.root ??= { props: {} };
    const root = data.root as { props?: Record<string, unknown> };
    root.props = deepMerge(root.props ?? {}, rest);
    return [];
  }
  const found = findNode(data, shapes, id);
  if (!found) throw new Error(`No component with id "${id}".`);
  // Children are only changed through the add/move/remove tools, which keep ids intact.
  const slots = slotNamesOf(found.node, shapes);
  const ignored = Object.keys(rest).filter((key) => slots.includes(key));
  for (const key of ignored) delete rest[key];
  found.node.props = { ...deepMerge(found.node.props as Record<string, unknown>, rest), id } as ComponentData["props"];
  return ignored;
}

export function moveNode(data: Data, shapes: Shapes, id: string, parentId: string, slot: string | undefined, index: number | undefined): void {
  const found = findNode(data, shapes, id);
  if (!found) throw new Error(`No component with id "${id}".`);
  if (parentId === id || isDescendant(found.node, shapes, parentId)) throw new Error("Can't move a component into itself.");
  // Resolve the destination first so a bad one leaves the component where it was.
  const destination = slotList(data, shapes, parentId, slot);
  found.list.splice(found.index, 1);
  destination.splice(clampIndex(index, destination.length), 0, found.node);
}

export function removeNodes(data: Data, shapes: Shapes, ids: string[]): string[] {
  const missing: string[] = [];
  for (const id of ids) {
    const found = findNode(data, shapes, id);
    if (!found) {
      missing.push(id);
      continue;
    }
    found.list.splice(found.index, 1);
  }
  return missing;
}

// Props as the assistant reads them: each slot replaced by its children's ids, since the children
// are listed in the outline and can be read on their own.
export function readableProps(node: ComponentData, shapes: Shapes): Record<string, unknown> {
  const props: Record<string, unknown> = { ...(node.props as Record<string, unknown>) };
  for (const [slot, children] of childLists(node, shapes)) props[slot] = children.map((child) => child.props.id);
  return props;
}

const PREVIEW_LENGTH = 60;

function previewText(value: string): string {
  const text = value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH)}…` : text;
}

// A few of a component's own values, enough to tell it apart and refer to it ("the Learn more
// button"), without the full props the assistant can fetch if it needs them.
function summarize(node: ComponentData, slots: string[]): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(node.props as Record<string, unknown>)) {
    if (key === "id" || slots.includes(key) || parts.length >= 3) continue;
    if (typeof value === "string" && value.trim()) {
      parts.push(`${key}=${JSON.stringify(previewText(value))}`);
    } else if (isPlainObject(value) && typeof value.title === "string" && typeof value.id === "string") {
      parts.push(`${key}=image:${JSON.stringify(value.title)}`);
    }
  }
  return parts.join(" ");
}

// The document as an indented tree, one line per component — what the assistant sees of the
// page on every turn. Full props are fetched per component with the get_props tool.
export function outline(data: Data, shapes: Shapes): string {
  const lines: string[] = [];
  const rootProps = (data.root as { props?: Record<string, unknown> } | undefined)?.props ?? {};
  const rootSummary = Object.entries(rootProps)
    .filter(([, v]) => typeof v === "string" && v.trim())
    .slice(0, 4)
    .map(([k, v]) => `${k}=${JSON.stringify(previewText(v as string))}`)
    .join(" ");
  lines.push(`root ${rootSummary}`.trimEnd());

  const walk = (list: ComponentData[], depth: number) => {
    for (const node of list) {
      const slots = slotNamesOf(node, shapes);
      const summary = summarize(node, slots);
      lines.push(`${"  ".repeat(depth)}- ${node.type} id=${node.props.id}${summary ? ` ${summary}` : ""}`);
      for (const [slot, children] of childLists(node, shapes)) {
        lines.push(`${"  ".repeat(depth + 1)}[${slot}]${children.length ? "" : " (empty)"}`);
        walk(children, depth + 2);
      }
    }
  };
  if (!data.content?.length) lines.push("  (page is empty)");
  walk(data.content ?? [], 1);
  return lines.join("\n");
}
