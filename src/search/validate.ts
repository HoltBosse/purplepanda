import { valueSchemaForField } from "./schema.js";
import type { SearchAst, SearchFieldSpec, ValidatedSearchAst } from "./types.js";

const NULL_LITERAL = "null";

/**
 * Cross-checks a parsed AST against a concrete list of fields, annotating each term with whether
 * it's valid so a GUI can style it like GitHub issue search does (recognized qualifiers vs.
 * plain/invalid text). Bare text terms (no `field:` prefix) are always valid — they're always a
 * legal full-text search term regardless of what fields exist.
 */
export function validateSearchAst<TField extends SearchFieldSpec>(
  ast: SearchAst,
  fields: readonly TField[],
): ValidatedSearchAst<TField> {
  const byName = new Map(fields.map((f) => [f.name, f]));

  return ast.map((node) => {
    if (node.kind === "text") {
      return { node, valid: true };
    }

    const field = byName.get(node.field);
    if (!field) {
      return { node, valid: false, error: `Unknown field "${node.field}"` };
    }

    const error = validateFieldValue(field, node.value, node.wildcard);
    return { node, valid: error === undefined, error, field };
  });
}

/** Returns an error message, or `undefined` if the raw value is valid for the given field. */
function validateFieldValue(field: SearchFieldSpec, rawValue: string, wildcard: boolean): string | undefined {
  if (rawValue.length === 0) return "Expected a value";

  if (field.nullable && rawValue === NULL_LITERAL) return undefined;

  if (wildcard) {
    if (field.type !== "text") return `Wildcards are not supported for "${field.name}" (expected ${describeType(field)})`;
    if (field.wildcard === false) return `Wildcards are not allowed for "${field.name}"`;
    return undefined;
  }

  const result = valueSchemaForField(field).safeParse(rawValue);
  return result.success ? undefined : `Expected ${describeType(field)}`;
}

function describeType(field: SearchFieldSpec): string {
  switch (field.type) {
    case "boolean":
      return field.nullable ? "true, false, or null" : "true or false";
    case "date":
      return "a date (YYYY-MM-DD)";
    case "datetime":
      return "a date or datetime (YYYY-MM-DD[THH:MM[:SS]])";
    case "time":
      return "a time (HH:MM[:SS])";
    case "enum":
      return `one of: ${(field.enumValues ?? []).join(", ")}`;
    case "text":
    default:
      return "text";
  }
}
