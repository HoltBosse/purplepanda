type JsonObject = Record<string, unknown>;

// Props whose names start with `_` (e.g. FormEmbed's `_html`) belong to a component's `data`
// resolver: they're computed server-side at render time and never authored in the editor, so any
// such key found in stored content was written there by hand-crafted POST data rather than by
// Puck. Rendering it would let whoever saved the content inject markup the resolver never
// produced, so both the SSR and client resolution paths drop these keys from stored props before
// merging in the resolver's own output.
export function stripResolverOwnedProps(props: JsonObject): JsonObject {
  let stripped: JsonObject | undefined;
  for (const key of Object.keys(props)) {
    if (!key.startsWith("_")) continue;
    stripped ??= { ...props };
    delete stripped[key];
  }
  return stripped ?? props;
}
