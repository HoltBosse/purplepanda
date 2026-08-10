// Server-only: converts a validated search AST into a Drizzle Postgres `where` condition. Pulls
// in `drizzle-orm`, so this must never be imported from a client-side React island — import
// `./index.js` (or the individual grammar/validate modules) there instead.
import { and, eq, ilike, isNull, like, or, type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn, PgSelect, PgTable } from "drizzle-orm/pg-core";
import type { FieldTermNode, SearchAst, SearchFieldSpec, TextTermNode } from "./types.js";
import { validateSearchAst } from "./validate.js";

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
 * All three are case-insensitive; quoting a field value only groups it (`form:"Newsletter Signup"`).
 */
export type TextMatchMode = "exact" | "contains" | "fulltext";

/**
 * A plain column, or any SQL expression yielding a value — e.g. a JSONB path
 * (sql`${pages.content} -> 'root' -> 'props' ->> 'title'`) for schemas that keep searchable text
 * inside a document rather than in its own column.
 */
export type SearchColumn = AnyPgColumn | SQL;

export interface DrizzleSearchField extends SearchFieldSpec {
  /** The (possibly joined) column, or SQL expression, this field reads from. */
  column: SearchColumn;
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
  /** See `prefixMatch` on FulltextSearchConfig. Defaults to true. */
  prefixMatch?: boolean;
  /** See `substringMatch` on FulltextSearchConfig. Defaults to true. */
  substringMatch?: boolean;
}

export interface FulltextSearchConfig {
  /** Column(s)/expression(s) matched by an unqualified term, e.g. `foo` or `"foo"`. Combined with `coalesce`. */
  columns: readonly SearchColumn[];
  /** `regconfig` used for `to_tsvector`/`websearch_to_tsquery`. Defaults to "simple" (no stemming/stopwords — see DEFAULT_LANGUAGE above). */
  language?: string;
  /** See `normalizeSymbols` on DrizzleSearchField. Defaults to true. */
  normalizeSymbols?: boolean;
  /**
   * Match each term as a lexeme *prefix* (`to_tsquery('bird:*')`) instead of a whole lexeme.
   * Postgres full-text search is lexeme-based, not substring-based: searching "bird" matches
   * "smol bird" (lexemes 'smol','bird') but NOT "birdo" (lexeme 'birdo'), which surprises anyone
   * who expects a search box to match as they type. Prefix matching fixes that while staying real
   * tsquery (and still index-usable). Note it is a *prefix*: "bird" finds "birdo", but "irdo" does
   * not — see `substringMatch` to cover that too. Defaults to true.
   */
  prefixMatch?: boolean;
  /**
   * Additionally OR in a case-insensitive substring match on the raw term, covering the two things
   * full-text search structurally cannot do: mid-word matches ("irdo" finding "birdo") and literal
   * matches that span the symbol boundaries `normalizeSymbols` splits on ("xkcd.com/1360" matching
   * a URL verbatim). The two are complements — tsquery brings word-aware, order-independent,
   * multi-word AND semantics; the substring pass brings raw literal matching.
   *
   * Cost: `ILIKE '%term%'` has a leading wildcard, so it can't use a B-tree index, and OR-ing it
   * alongside the tsquery keeps a GIN index from being used either. That's free today — none of
   * these tables has an FTS index, so the tsvector is already recomputed per row on a sequential
   * scan — but if a GIN index is ever added for scale, prefer the `pg_trgm` extension (a GIN
   * trigram index makes `ILIKE '%x%'` itself indexable) over this flag. Defaults to true.
   */
  substringMatch?: boolean;
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
  const fullText = sql`${vector} @@ ${toTsQuery(term, language, fulltext.prefixMatch ?? true)}`;

  if (fulltext.substringMatch === false) return fullText;

  // Matched against the *raw* value, not the normalized one, so a literal like "xkcd.com/1360"
  // still matches verbatim even though the tsvector side split it into separate words.
  const pattern = `%${escapeLikePattern(node.value)}%`;
  return or(fullText, ...[...fulltext.columns].map((c) => ilike(c, pattern)));
}

function buildFieldCondition(node: FieldTermNode, field: DrizzleSearchField): SQL | undefined {
  if (field.nullable && node.value === "null") {
    return isNull(field.column);
  }

  switch (field.type) {
    case "boolean":
      return eqValue(field.column, node.value === "true");
    case "date":
      return dateRangeCondition(field.column, node.value);
    case "datetime":
      return /^\d{4}-\d{2}-\d{2}$/.test(node.value)
        ? dateRangeCondition(field.column, node.value)
        : eqValue(field.column, node.value);
    case "time":
      return eqValue(field.column, node.value);
    case "enum": {
      const mapped = field.valueMap ? field.valueMap[node.value] : node.value;
      return mapped === undefined ? undefined : eqValue(field.column, mapped);
    }
    default:
      return buildTextFieldCondition(node, field);
  }
}

// On a FIELD value, quoting means "treat this as one value, spaces included" — it is the only way
// to write `form:"Newsletter Signup"` — and deliberately does NOT imply case-sensitivity. Otherwise
// any name containing a space could only ever be matched with exact casing, since quoting would be
// both the grouping mechanism and a case-sensitivity switch. Quote-means-case-sensitive still
// applies to bare search terms (`'foo'`), which is where the grammar defines it.
function buildTextFieldCondition(node: FieldTermNode, field: DrizzleSearchField): SQL {
  if (node.wildcard) {
    return ilike(field.column, wildcardToLikePattern(node.value));
  }

  const mode = field.matchMode ?? "exact";
  const containsPattern = `%${escapeLikePattern(node.value)}%`;

  if (mode === "fulltext") {
    if (node.quoted) return ilike(field.column, containsPattern);
    const language = field.language ?? DEFAULT_LANGUAGE;
    const normalize = field.normalizeSymbols ?? true;
    const term = normalize ? normalizeFulltextTerm(node.value) : node.value;
    if (term.length === 0) return ilike(field.column, containsPattern);
    const vector = toTsVector([field.column], language, normalize);
    const fullText = sql`${vector} @@ ${toTsQuery(term, language, field.prefixMatch ?? true)}`;
    return field.substringMatch === false ? fullText : or(fullText, ilike(field.column, containsPattern))!;
  }

  if (mode === "contains") return ilike(field.column, containsPattern);

  // "exact": a case-insensitive whole-value match. The value is escaped so that a literal % or _
  // inside it isn't silently treated as a LIKE wildcard (`*`/`?` are the grammar's wildcards).
  return ilike(field.column, escapeLikePattern(node.value));
}

// `eq` is overloaded per operand type and can't resolve a `Column | SQL` union at compile time,
// even though it handles both identically at runtime (it inspects the operand dynamically to decide
// how to bind the parameter). The cast is erased, so the real Column is still what `eq` receives.
function eqValue(column: SearchColumn, value: unknown): SQL {
  return eq(column as SQL, value);
}

const SAFE_TSQUERY_TOKEN = /^[a-zA-Z0-9]+$/;

/**
 * Builds the tsquery side of a full-text match. `websearch_to_tsquery` accepts arbitrary user input
 * safely but can't express prefix matching, while `to_tsquery` can (`bird:*`) but parses operators
 * (`& | ! ( ) :`) and errors on malformed input. So prefix mode is only used when every token is
 * plain alphanumeric — which `normalizeSymbols` (on by default) already guarantees. Anything else
 * falls back to `websearch_to_tsquery`, so untrusted input can never reach `to_tsquery`.
 */
function toTsQuery(term: string, language: string, prefixMatch: boolean): SQL {
  const config = regconfig(language);
  if (prefixMatch) {
    const tokens = term.split(/\s+/).filter((t) => t.length > 0);
    if (tokens.length > 0 && tokens.every((t) => SAFE_TSQUERY_TOKEN.test(t))) {
      return sql`to_tsquery(${config}, ${tokens.map((t) => `${t}:*`).join(" & ")})`;
    }
  }
  return sql`websearch_to_tsquery(${config}, ${term})`;
}

const SYMBOL_RUN = /[^a-zA-Z0-9]+/g;

/** Mirrors the `regexp_replace` applied to the columns in `toTsVector`, so both sides tokenize alike. */
function normalizeFulltextTerm(value: string): string {
  return value.replace(SYMBOL_RUN, " ").trim();
}

function toTsVector(columns: readonly SearchColumn[], language: string, normalize: boolean): SQL {
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

function dateRangeCondition(column: SearchColumn, isoDate: string): SQL {
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
