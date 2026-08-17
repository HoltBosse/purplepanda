export type ComponentNode = { type: string; props: Record<string, unknown> };

// Puck stores nested children inline as arrays under `slot`-typed props (see Grid/Flex/Margin),
// rather than in a separate zones map, so a schema-less structural walk finds every component
// node without needing each parent's field definitions. Shared by both the form-submission schema
// (./form/schema.js) and the editor-props validator (./validate-content.js), which walk the same
// tree shape for two different purposes.
export function collectComponentNodes(value: unknown, nodes: ComponentNode[] = []): ComponentNode[] {
  if (Array.isArray(value)) {
    for (const item of value) collectComponentNodes(item, nodes);
    return nodes;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.type === "string" && obj.props && typeof obj.props === "object") {
      nodes.push({ type: obj.type, props: obj.props as Record<string, unknown> });
      for (const propValue of Object.values(obj.props as Record<string, unknown>)) {
        collectComponentNodes(propValue, nodes);
      }
    }
  }
  return nodes;
}
