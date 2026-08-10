// Shared, schema-agnostic types for the search grammar. Nothing here knows about Drizzle or any
// particular table — that lives in ./drizzle.ts. This module (and everything it depends on) is
// safe to import from a client-side React island.

/** The kind of value a field is allowed to hold, independent of any database column type. */
export type SearchFieldType = "text" | "boolean" | "date" | "datetime" | "time" | "enum";

/**
 * How a field term's value relates to the column: `eq` (the default, `field:value`) or one of the
 * relational operators below, written immediately after the `:` — e.g. `submitted:>=2024-01-01`.
 * Only meaningful for ordered field types (date/datetime/time); a "between" search is just two
 * terms for the same field ANDed together (`submitted:>=2024-01-01 submitted:<=2024-01-31`).
 */
export type SearchOperator = "eq" | "gt" | "gte" | "lt" | "lte";

/**
 * Describes one searchable field for the purposes of parsing/validating/autocompleting a query
 * (e.g. `state:enabled`). This is the client-safe subset shared by the GUI and the grammar
 * validator; the Drizzle query builder extends this with a `column` reference (see ./drizzle.ts).
 */
export interface SearchFieldSpec {
  /** The grammar token used before `:`, e.g. "author" in `author:foo@example.com`. */
  name: string;
  type: SearchFieldType;
  /** Human-readable label for the autocomplete dropdown. Defaults to `name`. */
  label?: string | undefined;
  /** Shown under the field name in the autocomplete dropdown. */
  description?: string | undefined;
  /** Whether `field:null` is accepted for this field. */
  nullable?: boolean | undefined;
  /** Allowed literal values for `type: "enum"`, e.g. ["enabled", "disabled", "deleted"]. */
  enumValues?: string[] | undefined;
  /** Whether `*`/`?` wildcards are honored for `type: "text"`. Defaults to true. */
  wildcard?: boolean | undefined;
}

/** A single `'...'` or `"..."` or bare token as it was lexed, before semantic interpretation. */
export interface RawToken {
  /** The field name before `:`, if this token was of the form `field:value`. */
  field?: string | undefined;
  /**
   * A relational operator (`>`, `>=`, `<`, `<=`) consumed immediately after `field:`, before the
   * value. Only recognized for unquoted values with a `field:` prefix. `undefined` means `eq`.
   */
  operator?: SearchOperator | undefined;
  /** The value text with quotes removed and escapes resolved. */
  value: string;
  /** Whether the value was wrapped in `'...'` or `"..."`. */
  quoted: boolean;
  /** The exact original substring, quotes included, for GUI highlighting. */
  raw: string;
  /** Offsets into the original query string. */
  start: number;
  end: number;
}

/** A `field:value` term, e.g. `state:enabled` or `created:2020-01-01`. */
export interface FieldTermNode extends Omit<RawToken, "field" | "operator"> {
  kind: "field";
  field: string;
  /** True if the (unquoted) value contains `*` or `?`. */
  wildcard: boolean;
  /** Defaults to `"eq"` when no operator was written. */
  operator: SearchOperator;
}

/** A bare search term with no field qualifier, e.g. `foo` or `"foo"`. */
export interface TextTermNode extends RawToken {
  kind: "text";
  /** Quoted terms are matched case-sensitively; unquoted terms are case-insensitive. */
  caseSensitive: boolean;
}

export type SearchTermNode = FieldTermNode | TextTermNode;

/** The parsed query: an ordered list of terms, ANDed together. */
export type SearchAst = SearchTermNode[];

export interface ValidatedTerm<TField extends SearchFieldSpec = SearchFieldSpec> {
  node: SearchTermNode;
  valid: boolean;
  error?: string | undefined;
  /** The matching field config, present whenever `node.kind === "field"` and the field is known. */
  field?: TField | undefined;
}

export type ValidatedSearchAst<TField extends SearchFieldSpec = SearchFieldSpec> = ValidatedTerm<TField>[];
