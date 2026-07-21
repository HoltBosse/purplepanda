// Server-only: converts a validated search AST into a Drizzle Postgres `where` condition. Pulls
// in `drizzle-orm`, so this must never be imported from a client-side React island — import
// `./index.js` (or the individual grammar/validate modules) there instead.
import { and, eq, ilike, isNull, like, or, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn, PgSelect, PgTable } from "drizzle-orm/pg-core";
import { validateSearchAst } from "./validate.js";
import type { FieldTermNode, SearchAst, SearchFieldSpec, TextTermNode } from "./types.js";

// "simple" (not "english"): the english config strips common stopwords ("very", "the", "a", ...)
// from both the document vector and the query, so a search for a stopword-only term like "very"
// would silently match nothing even though it appears verbatim in the text. "simple" just
// lowercases and tokenizes, matching what a search box's users actually expect.
const DEFAULT_LANGUAGE = "simple";

/**
 * How an unqualified-of-wildcards `type: "text"` field value is matched. Ignored for other field
 * types.
 *   - "exact"    (default) case-insensitive equality, e.g. `state:enabled`
 *   - "contains" case-insensitive substring, e.g. `title:report` matches "Q1 report.pdf"
 *   - "fulltext" Postgres `tsvector`/`tsquery` match against this column specifically
 * A wildcard value (`foo*bar`, `foo?bar`) always overrides this with a translated `ILIKE` pattern.
 */
export type TextMatchMode = "exact" | "contains" | "fulltext";

export interface DrizzleSearchField extends SearchFieldSpec {
  /** The (possibly joined) column this field reads from. */
  column: AnyPgColumn;
  matchMode?: TextMatchMode;
  /** Maps a grammar token to the value actually stored in the column, e.g. `{ enabled: 1 }`. */
  valueMap?: Record<string, unknown>;
  /** `regconfig` used for `matchMode: "fulltext"`. Defaults to "simple" (no stemming/stopwords — see DEFAULT_LANGUAGE above). */
  language?: string;
  /**
   * Split runs of non-alphanumeric characters into word boundaries on both sides of a full-text
   * match. Postgres's text parser keeps URLs and paths as single indivisible tokens — e.g.
   * `https://xkcd.com/1360/` lexes to `xkcd.com/1360/`, `xkcd.com`, `/1360/`, and `/some-path` to
   * one `/some-path` token — so searching `xkcd` or `path` would otherwise match nothing at all on
   * URL/path/identifier columns. Defaults to true.
   */
  normalizeSymbols?: boolean;
}

export interface FulltextSearchConfig {
  /** Column(s) matched by an unqualified term, e.g. `foo` or `"foo"`. Combined with `coalesce`. */
  columns: readonly AnyPgColumn[];
  /** `regconfig` used for `to_tsvector`/`websearch_to_tsquery`. Defaults to "simple" (no stemming/stopwords — see DEFAULT_LANGUAGE above). */
  language?: string;
  /** See `normalizeSymbols` on DrizzleSearchField. Defaults to true. */
  normalizeSymbols?: boolean;
}

export interface JoinConfig {
  table: PgTable;
  on: SQL;
  /** Defaults to "left". */
  type?: "inner" | "left";
}

export interface DrizzleSearchConfig {
  fields: readonly DrizzleSearchField[];
  /** Required if the query may contain unqualified terms (plain `foo` / `"foo"`). */
  fulltext?: FulltextSearchConfig;
  /** Extra tables this search's fields/fulltext columns live on, beyond the query's base table. */
  joins?: readonly JoinConfig[];
}

/** Chains the configured joins onto a query builder obtained via `db.select(...).from(base).$dynamic()`. */
export function applySearchJoins<T extends PgSelect>(qb: T, joins: readonly JoinConfig[] = []): T {
  let acc: PgSelect = qb;
  for (const join of joins) {
    acc = join.type === "inner" ? acc.innerJoin(join.table, join.on) : acc.leftJoin(join.table, join.on);
  }
  return acc as T;
}

/**
 * Converts a search AST into a single Drizzle `where` condition (terms are ANDed together),
 * resolving each `field:value` term against `config.fields` and each bare term into a full-text
 * (`tsvector`/`websearch_to_tsquery`) match against `config.fulltext.columns` — or, for a quoted
 * (case-sensitive) term, a literal `LIKE` match, since Postgres full text search always folds case.
 * Unrecognized fields or values that don't fit their field's type are silently skipped (the GUI is
 * responsible for surfacing that to the user before submit; see `./validate.js`).
 */
export function buildSearchWhere(ast: SearchAst, config: DrizzleSearchConfig): SQL | undefined {
  const validated = validateSearchAst(ast, config.fields);
  const conditions: SQL[] = [];

  for (const term of validated) {
    if (!term.valid) continue;

    if (term.node.kind === "text") {
      const condition = buildTextSearchCondition(term.node, config.fulltext);
      if (condition) conditions.push(condition);
      continue;
    }

    if (!term.field) continue;
    const condition = buildFieldCondition(term.node, term.field);
    if (condition) conditions.push(condition);
  }

  return and(...conditions);
}

function buildTextSearchCondition(node: TextTermNode, fulltext?: FulltextSearchConfig): SQL | undefined {
  if (node.value.length === 0) return undefined;
  if (!fulltext || fulltext.columns.length === 0) {
    throw new Error("[purplepanda/search] query contains an unqualified term but no `fulltext` columns were configured");
  }

  if (node.caseSensitive) {
    const pattern = `%${escapeLikePattern(node.value)}%`;
    const perColumn = fulltext.columns.map((c) => like(c, pattern));
    return combine(or, perColumn);
  }

  const language = fulltext.language ?? DEFAULT_LANGUAGE;
  const normalize = fulltext.normalizeSymbols ?? true;
  const term = normalize ? normalizeFulltextTerm(node.value) : node.value;

  // An all-symbol term (e.g. "/") normalizes to nothing, and an empty tsquery matches no rows at
  // all — fall back to a substring match so such a search still behaves sensibly.
  if (term.length === 0) {
    const pattern = `%${escapeLikePattern(node.value)}%`;
    return combine(or, [...fulltext.columns].map((c) => ilike(c, pattern)));
  }

  const vector = toTsVector(fulltext.columns, language, normalize);
  return sql`${vector} @@ websearch_to_tsquery(${regconfig(language)}, ${term})`;
}

function buildFieldCondition(node: FieldTermNode, field: DrizzleSearchField): SQL | undefined {
  if (field.nullable && node.value === "null") {
    return isNull(field.column);
  }

  switch (field.type) {
    case "boolean":
      return eq(field.column, node.value === "true");
    case "date":
      return dateRangeCondition(field.column, node.value);
    case "datetime":
      return /^\d{4}-\d{2}-\d{2}$/.test(node.value)
        ? dateRangeCondition(field.column, node.value)
        : eq(field.column, node.value);
    case "time":
      return eq(field.column, node.value);
    case "enum": {
      const mapped = field.valueMap ? field.valueMap[node.value] : node.value;
      return mapped === undefined ? undefined : eq(field.column, mapped);
    }
    case "text":
    default:
      return buildTextFieldCondition(node, field);
  }
}

function buildTextFieldCondition(node: FieldTermNode, field: DrizzleSearchField): SQL {
  if (node.wildcard) {
    return ilike(field.column, wildcardToLikePattern(node.value));
  }

  const mode = field.matchMode ?? "exact";

  if (mode === "fulltext") {
    if (node.quoted) return like(field.column, `%${escapeLikePattern(node.value)}%`);
    const language = field.language ?? DEFAULT_LANGUAGE;
    const normalize = field.normalizeSymbols ?? true;
    const term = normalize ? normalizeFulltextTerm(node.value) : node.value;
    if (term.length === 0) return ilike(field.column, `%${escapeLikePattern(node.value)}%`);
    const vector = toTsVector([field.column], language, normalize);
    return sql`${vector} @@ websearch_to_tsquery(${regconfig(language)}, ${term})`;
  }

  if (mode === "contains") {
    const pattern = `%${escapeLikePattern(node.value)}%`;
    return node.quoted ? like(field.column, pattern) : ilike(field.column, pattern);
  }

  return node.quoted ? eq(field.column, node.value) : ilike(field.column, node.value);
}

const SYMBOL_RUN = /[^a-zA-Z0-9]+/g;

/** Mirrors the `regexp_replace` applied to the columns in `toTsVector`, so both sides tokenize alike. */
function normalizeFulltextTerm(value: string): string {
  return value.replace(SYMBOL_RUN, " ").trim();
}

function toTsVector(columns: readonly AnyPgColumn[], language: string, normalize: boolean): SQL {
  const config = regconfig(language);
  const parts = columns.map((c) => {
    const text = sql`coalesce(${c}, '')`;
    return normalize ? sql`regexp_replace(${text}, '[^a-zA-Z0-9]+', ' ', 'g')` : text;
  });
  const first = parts[0];
  if (parts.length === 1 && first) {
    return sql`to_tsvector(${config}, ${first})`;
  }
  return sql`to_tsvector(${config}, ${sql.join(parts, sql` || ' ' || `)})`;
}

// `to_tsvector`/`websearch_to_tsquery` take a `regconfig`, which (unlike most types) has no
// implicit cast from a bound `text` parameter — only from an untyped string literal. Casting
// explicitly avoids a "function ... does not exist" error at query time.
function regconfig(language: string): SQL {
  return sql`${language}::regconfig`;
}

function dateRangeCondition(column: AnyPgColumn, isoDate: string): SQL {
  return sql`${column} >= ${isoDate} and ${column} < ${nextIsoDate(isoDate)}`;
}

function nextIsoDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function combine(op: typeof and | typeof or, conditions: SQL[]): SQL | undefined {
  return conditions.length === 1 ? conditions[0] : op(...conditions);
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function wildcardToLikePattern(value: string): string {
  let out = "";
  for (const ch of value) {
    if (ch === "\\") out += "\\\\";
    else if (ch === "%") out += "\\%";
    else if (ch === "_") out += "\\_";
    else if (ch === "*") out += "%";
    else if (ch === "?") out += "_";
    else out += ch;
  }
  return out;
}
