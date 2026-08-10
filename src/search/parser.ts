import { tokenize } from "./tokenizer.js";
import type { RawToken, SearchAst, SearchTermNode } from "./types.js";

const WILDCARD_RE = /[*?]/;

/**
 * Parses a raw search query string into an AST. This step is purely syntactic — it recognizes
 * the shape of the grammar (`field:value`, quoting, wildcards) but has no notion of which fields
 * exist or what a valid value looks like for a given field. Pair with `validateSearchAst` (see
 * `./validate.ts`) to check terms against a concrete set of fields before executing a search.
 *
 * Grammar:
 *   query      := term*
 *   term       := field ':' value | value
 *   field      := identifier                      (e.g. `name`, `created`, `member`)
 *   value      := bareword | "'" ... "'" | '"' ... '"'
 *
 * A bareword value containing `*` or `?` is flagged as a wildcard pattern. A quoted value (either
 * quote style) is matched case-sensitively; an unquoted value is matched case-insensitively.
 */
export function parseSearchQuery(input: string): SearchAst {
  return tokenize(input).map(toTermNode);
}

function toTermNode(token: RawToken): SearchTermNode {
  if (token.field !== undefined) {
    return {
      kind: "field",
      field: token.field,
      value: token.value,
      quoted: token.quoted,
      wildcard: !token.quoted && WILDCARD_RE.test(token.value),
      operator: token.operator ?? "eq",
      raw: token.raw,
      start: token.start,
      end: token.end,
    };
  }
  return {
    kind: "text",
    value: token.value,
    quoted: token.quoted,
    caseSensitive: token.quoted,
    raw: token.raw,
    start: token.start,
    end: token.end,
  };
}
