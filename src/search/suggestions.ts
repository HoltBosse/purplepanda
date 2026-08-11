// Autocomplete logic for SearchBar, kept apart from the component so it stays a plain function of
// (ast, fields, caret) with no React involved — the same split the rest of src/search/ already
// uses (tokenizer → parser → validate).
import type { SearchAst, SearchFieldSpec } from "./types.js";

export type Suggestion =
  | { kind: "field"; field: SearchFieldSpec }
  | { kind: "value"; field: SearchFieldSpec; value: string };

/**
 * The literal values worth offering for a field. Only closed value sets can be enumerated —
 * free-text and date fields have no candidate list — plus `null` where the field allows it.
 */
export function valueCandidates(field: SearchFieldSpec): string[] {
  const base =
    field.type === "boolean" ? ["true", "false"] : field.type === "enum" ? (field.enumValues ?? []) : [];
  return field.nullable ? [...base, "null"] : base;
}

/**
 * Suggestions for whichever term the caret currently sits in: field names while typing a bare
 * word, or that field's candidate values once a `field:` prefix has been committed.
 */
export function buildSuggestions(
  ast: SearchAst,
  fields: SearchFieldSpec[],
  caret: number,
): Suggestion[] {
  const node = ast.find((n) => caret >= n.start && caret <= n.end);

  if (!node || node.kind === "text") {
    const prefix = (node?.value ?? "").toLowerCase();
    return fields
      .filter((f) => f.name.toLowerCase().startsWith(prefix))
      .map((field) => ({ kind: "field", field }) as const);
  }

  const field = fields.find((f) => f.name === node.field);
  if (!field) return [];

  const prefix = node.value.toLowerCase();
  return valueCandidates(field)
    .filter((v) => v.toLowerCase().startsWith(prefix))
    .map((v) => ({ kind: "value", field, value: v }) as const);
}
