import type { RawToken, SearchOperator } from "./types.js";

const FIELD_PREFIX_RE = /^[A-Za-z_][A-Za-z0-9_]*:/;
const OPERATOR_RE = /^(>=|<=|>|<)/;
const OPERATOR_NAMES: Record<string, SearchOperator> = { ">": "gt", ">=": "gte", "<": "lt", "<=": "lte" };

/**
 * Splits a raw search query into tokens, honoring `'...'`/`"..."` quoting (which may contain
 * escaped quotes via `\`) and an optional `field:` prefix immediately before the value, itself
 * optionally followed by a relational operator (`>`, `>=`, `<`, `<=`) directly before an unquoted
 * value, e.g. `submitted:>=2024-01-01`. This is pure lexing — it knows nothing about which field
 * names or value shapes/operators are valid for them; that's `./parser.ts` (syntax) and
 * `./validate.ts` (semantics, against a caller-supplied field config).
 */
export function tokenize(input: string): RawToken[] {
  const tokens: RawToken[] = [];
  const n = input.length;
  let i = 0;

  while (i < n) {
    while (i < n && isWhitespace(input[i]!)) i++;
    if (i >= n) break;

    const start = i;
    let field: string | undefined;

    const fieldMatch = FIELD_PREFIX_RE.exec(input.slice(i));
    if (fieldMatch) {
      field = fieldMatch[0].slice(0, -1);
      i += fieldMatch[0].length;
    }

    let value: string;
    let quoted = false;
    let operator: SearchOperator | undefined;

    const quoteChar = input[i];
    if (quoteChar === '"' || quoteChar === "'") {
      quoted = true;
      i++;
      let buf = "";
      while (i < n && input[i] !== quoteChar) {
        if (input[i] === "\\" && i + 1 < n) {
          buf += input[i + 1];
          i += 2;
          continue;
        }
        buf += input[i];
        i++;
      }
      if (i < n) i++; // closing quote
      value = buf;
    } else {
      if (field !== undefined) {
        const opMatch = OPERATOR_RE.exec(input.slice(i));
        if (opMatch) {
          operator = OPERATOR_NAMES[opMatch[0]];
          i += opMatch[0].length;
        }
      }
      let buf = "";
      while (i < n && !isWhitespace(input[i]!)) {
        buf += input[i];
        i++;
      }
      value = buf;
    }

    const end = i;
    tokens.push({ field, operator, value, quoted, raw: input.slice(start, end), start, end });
  }

  return tokens;
}

function isWhitespace(ch: string): boolean {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r";
}
