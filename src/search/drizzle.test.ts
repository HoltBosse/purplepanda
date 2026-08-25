import { eq } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { documents, userActions, users } from '../db/schema';
import type { DrizzleSearchConfig } from './drizzle';
import { buildSearchWhere } from './drizzle';
import { parseSearchQuery } from './parser';

const dialect = new PgDialect();

function toQuery(where: ReturnType<typeof buildSearchWhere>) {
    if (!where) return { sql: '', params: [] as unknown[] };
    return dialect.sqlToQuery(where);
}

const baseConfig: DrizzleSearchConfig = {
    fields: [
        {
            name: 'state',
            type: 'enum',
            enumValues: ['enabled', 'disabled', 'deleted'],
            column: documents.state,
            valueMap: { enabled: 1, disabled: 0, deleted: -1 },
        },
        { name: 'author', type: 'text', column: users.email },
        { name: 'member', type: 'boolean', nullable: true, column: users.state },
        { name: 'created', type: 'date', column: userActions.date },
        { name: 'title', type: 'text', column: documents.title, matchMode: 'contains' },
    ],
    fulltext: { columns: [documents.title] },
};

describe('buildSearchWhere', () => {
    it('returns undefined for an empty query', () => {
        expect(buildSearchWhere(parseSearchQuery(''), baseConfig)).toBeUndefined();
    });

    it('builds a case-insensitive tsvector/tsquery match for a bare unquoted term', () => {
        const { sql, params } = toQuery(buildSearchWhere(parseSearchQuery('foo'), baseConfig)!);
        expect(sql).toContain('to_tsvector');
        expect(sql).toContain('to_tsquery');
        // Case-insensitive: the tsvector path folds case, and the substring path uses ILIKE rather
        // than a case-sensitive LIKE (which is reserved for quoted terms).
        expect(sql).not.toMatch(/(?<!i)\blike\b/i);
        expect(params).toContain('foo:*');
    });

    it('matches lexeme prefixes by default, so "bird" also finds "birdo"', () => {
        // Postgres FTS is lexeme-based: a plain query for "bird" matches 'smol bird' but not
        // 'birdo', which is a different lexeme entirely.
        const { params } = toQuery(buildSearchWhere(parseSearchQuery('bird'), baseConfig)!);
        expect(params).toContain('bird:*');
    });

    it('ANDs prefix terms together for a multi-word term', () => {
        const { params } = toQuery(buildSearchWhere(parseSearchQuery('xkcd.com'), baseConfig)!);
        expect(params).toContain('xkcd:* & com:*');
    });

    it('ORs a raw substring match alongside the tsquery by default', () => {
        // Covers what FTS structurally can't: mid-word matches, and literals spanning the symbol
        // boundaries the tsvector side splits on.
        const { sql, params } = toQuery(buildSearchWhere(parseSearchQuery('irdo'), baseConfig)!);
        expect(sql).toContain('to_tsvector');
        expect(sql.toLowerCase()).toContain('ilike');
        expect(sql.toLowerCase()).toContain(' or ');
        expect(params).toContain('%irdo%');
    });

    it('matches a symbol-spanning literal verbatim via the substring pass', () => {
        const { params } = toQuery(buildSearchWhere(parseSearchQuery('xkcd.com/1360'), baseConfig)!);
        // normalized for the tsquery side...
        expect(params).toContain('xkcd:* & com:* & 1360:*');
        // ...and kept raw for the substring side.
        expect(params).toContain('%xkcd.com/1360%');
    });

    it('emits only the tsquery when substringMatch is disabled', () => {
        const config: DrizzleSearchConfig = {
            ...baseConfig,
            fulltext: { columns: [documents.title], substringMatch: false },
        };
        const { sql } = toQuery(buildSearchWhere(parseSearchQuery('bird'), config)!);
        expect(sql).toContain('to_tsvector');
        expect(sql.toLowerCase()).not.toContain('ilike');
    });

    it('falls back to websearch_to_tsquery when prefixMatch is disabled', () => {
        const config: DrizzleSearchConfig = {
            ...baseConfig,
            fulltext: { columns: [documents.title], prefixMatch: false },
        };
        const { sql, params } = toQuery(buildSearchWhere(parseSearchQuery('foo'), config)!);
        expect(sql).toContain('websearch_to_tsquery');
        expect(params).toContain('foo');
    });

    it('never passes non-alphanumeric input to to_tsquery, which parses operators', () => {
        // With normalizeSymbols off the term can contain `& | ! ( ) :`, which to_tsquery would
        // either misparse or error on — that combination must use websearch_to_tsquery instead.
        const config: DrizzleSearchConfig = {
            ...baseConfig,
            fulltext: { columns: [documents.title], normalizeSymbols: false },
        };
        const { sql } = toQuery(buildSearchWhere(parseSearchQuery('foo&bar!baz'), config)!);
        expect(sql).toContain('websearch_to_tsquery');
        expect(sql).not.toMatch(/[^_]to_tsquery/);
    });

    it('splits non-alphanumerics on both sides so URLs/paths are searchable by their parts', () => {
        // Postgres lexes 'https://xkcd.com/1360/' as indivisible url tokens, so without this the
        // tsquery for "xkcd" could never match a URL column.
        const { sql } = toQuery(buildSearchWhere(parseSearchQuery('xkcd.com'), baseConfig)!);
        expect(sql).toContain('regexp_replace');
    });

    it('leaves the term intact when normalizeSymbols is disabled', () => {
        const config: DrizzleSearchConfig = {
            ...baseConfig,
            fulltext: { columns: [documents.title], normalizeSymbols: false },
        };
        const { sql, params } = toQuery(buildSearchWhere(parseSearchQuery('xkcd.com'), config)!);
        expect(sql).not.toContain('regexp_replace');
        expect(params).toContain('xkcd.com');
    });

    it('falls back to a substring match when a term is entirely symbols', () => {
        // "/" normalizes to an empty tsquery, which would otherwise match zero rows.
        const { sql, params } = toQuery(buildSearchWhere(parseSearchQuery('/'), baseConfig)!);
        expect(sql.toLowerCase()).toContain('ilike');
        expect(sql).not.toContain('to_tsvector');
        expect(params).toContain('%/%');
    });

    it('falls back to a case-sensitive LIKE match for a quoted bare term', () => {
        const { sql, params } = toQuery(buildSearchWhere(parseSearchQuery("'Foo'"), baseConfig)!);
        expect(sql.toLowerCase()).toContain('like');
        expect(sql).not.toContain('to_tsvector');
        expect(params).toContain('%Foo%');
    });

    it('throws if a bare term is used without fulltext columns configured', () => {
        const config: DrizzleSearchConfig = { fields: baseConfig.fields };
        expect(() => buildSearchWhere(parseSearchQuery('foo'), config)).toThrow(/fulltext/);
    });

    it('maps an enum token to its configured database value', () => {
        const { sql, params } = toQuery(buildSearchWhere(parseSearchQuery('state:enabled'), baseConfig)!);
        expect(sql).toContain('=');
        expect(params).toContain(1);
    });

    it('builds a boolean equality condition', () => {
        const { params } = toQuery(buildSearchWhere(parseSearchQuery('member:true'), baseConfig)!);
        expect(params).toContain(true);
    });

    it('builds an isNull condition for a nullable field given the null literal', () => {
        const { sql } = toQuery(buildSearchWhere(parseSearchQuery('member:null'), baseConfig)!);
        expect(sql.toLowerCase()).toContain('is null');
    });

    it('builds a day-range condition for a date field', () => {
        const { sql, params } = toQuery(buildSearchWhere(parseSearchQuery('created:2020-01-01'), baseConfig)!);
        expect(sql).toContain('>=');
        expect(sql).toContain('<');
        expect(params).toContain('2020-01-01');
        expect(params).toContain('2020-01-02');
    });

    it('builds an after (gt) condition for a date field from the next day onward', () => {
        const { sql, params } = toQuery(buildSearchWhere(parseSearchQuery('created:>2020-01-01'), baseConfig)!);
        expect(sql).toContain('>=');
        expect(params).toEqual(['2020-01-02']);
    });

    it('builds an on-or-after (gte) condition for a date field from that day', () => {
        const { sql, params } = toQuery(buildSearchWhere(parseSearchQuery('created:>=2020-01-01'), baseConfig)!);
        expect(sql).toContain('>=');
        expect(params).toEqual(['2020-01-01']);
    });

    it('builds a before (lt) condition for a date field up to that day', () => {
        const { sql, params } = toQuery(buildSearchWhere(parseSearchQuery('created:<2020-01-01'), baseConfig)!);
        expect(sql).toContain('<');
        expect(params).toEqual(['2020-01-01']);
    });

    it('builds an on-or-before (lte) condition for a date field through the end of that day', () => {
        const { sql, params } = toQuery(buildSearchWhere(parseSearchQuery('created:<=2020-01-01'), baseConfig)!);
        expect(sql).toContain('<');
        expect(params).toEqual(['2020-01-02']);
    });

    it('ANDs two operator terms on the same field into a between-style range', () => {
        const { sql, params } = toQuery(
            buildSearchWhere(parseSearchQuery('created:>=2020-01-01 created:<=2020-01-31'), baseConfig)!,
        );
        expect(sql.toLowerCase()).toContain(' and ');
        expect(params).toEqual(['2020-01-01', '2020-02-01']);
    });

    it('translates a wildcard field value into an ILIKE pattern', () => {
        const { sql, params } = toQuery(buildSearchWhere(parseSearchQuery('title:foo*bar'), baseConfig)!);
        expect(sql.toLowerCase()).toContain('ilike');
        expect(params).toContain('foo%bar');
    });

    it('translates the ? wildcard into a single-character ILIKE pattern', () => {
        const { params } = toQuery(buildSearchWhere(parseSearchQuery('title:foo?bar'), baseConfig)!);
        expect(params).toContain('foo_bar');
    });

    it('uses a contains ILIKE match for a text field in "contains" mode', () => {
        const { sql, params } = toQuery(buildSearchWhere(parseSearchQuery('title:report'), baseConfig)!);
        expect(sql.toLowerCase()).toContain('ilike');
        expect(params).toContain('%report%');
    });

    it('uses a case-insensitive exact match for a text field in the default "exact" mode', () => {
        const { sql, params } = toQuery(buildSearchWhere(parseSearchQuery('author:jane@example.com'), baseConfig)!);
        expect(sql.toLowerCase()).toContain('ilike');
        expect(params).toContain('jane@example.com');
        expect(params).not.toContain('%jane@example.com%');
    });

    it('quotes a field value to group spaces, without forcing case-sensitivity', () => {
        // Quoting is the only way to express a space in a field value, so it must not also mean
        // "match case exactly" — otherwise a name like "Newsletter Signup" could never be found
        // without reproducing its casing.
        const { sql, params } = toQuery(buildSearchWhere(parseSearchQuery('title:"q1 report"'), baseConfig)!);
        expect(sql.toLowerCase()).toContain('ilike');
        expect(sql).not.toMatch(/(?<!i)\blike\b/i);
        expect(params).toContain('%q1 report%');
    });

    it('matches a quoted exact-mode field value case-insensitively', () => {
        const { sql, params } = toQuery(buildSearchWhere(parseSearchQuery('author:"Jane Doe"'), baseConfig)!);
        expect(sql.toLowerCase()).toContain('ilike');
        expect(params).toContain('Jane Doe');
    });

    it('escapes LIKE metacharacters in an exact-mode value', () => {
        const { params } = toQuery(buildSearchWhere(parseSearchQuery('author:a%b_c'), baseConfig)!);
        expect(params).toContain('a\\%b\\_c');
    });

    it('silently skips an unrecognized field rather than throwing', () => {
        expect(buildSearchWhere(parseSearchQuery('bogus:x'), baseConfig)).toBeUndefined();
    });

    it('ANDs multiple valid terms together', () => {
        const { sql } = toQuery(buildSearchWhere(parseSearchQuery('state:enabled author:jane@example.com'), baseConfig)!);
        expect(sql.toLowerCase()).toContain(' and ');
    });

    it('applies joins via applySearchJoins', async () => {
        const { applySearchJoins } = await import('./drizzle');
        const joins: DrizzleSearchConfig['joins'] = [
            { table: userActions, on: eq(userActions.userId, users.id), type: 'left' },
        ];
        // Just compile the join-chaining path — no connection is opened by .toSQL().
        const { drizzle } = await import('drizzle-orm/node-postgres');
        const { Pool } = await import('pg');
        const db = drizzle(new Pool({ connectionString: 'postgresql://unused/unused' }));
        const qb = applySearchJoins(db.select().from(documents).$dynamic(), joins);
        const { sql } = qb.toSQL();
        expect(sql.toLowerCase()).toContain('left join');
    });
});

describe('buildSearchWhere defaultExclude', () => {
    const configWithDefaultExclude: DrizzleSearchConfig = {
        fields: [
            {
                name: 'state',
                type: 'enum',
                enumValues: ['enabled', 'disabled', 'deleted'],
                column: documents.state,
                valueMap: { enabled: 1, disabled: 0, deleted: -1 },
                defaultExclude: ['deleted'],
            },
            { name: 'title', type: 'text', column: documents.title, matchMode: 'contains' },
        ],
        fulltext: { columns: [documents.title] },
    };

    it('excludes the default value when the query never mentions the field', () => {
        const { sql, params } = toQuery(buildSearchWhere(parseSearchQuery(''), configWithDefaultExclude)!);
        expect(sql.toLowerCase()).toContain('not in');
        expect(params).toContain(-1);
    });

    it('still excludes the default value when other fields are searched', () => {
        const { sql, params } = toQuery(buildSearchWhere(parseSearchQuery('title:foo'), configWithDefaultExclude)!);
        expect(sql.toLowerCase()).toContain('not in');
        expect(params).toContain(-1);
    });

    it('drops the default exclusion once the field itself is searched, even for the excluded value', () => {
        const { sql, params } = toQuery(buildSearchWhere(parseSearchQuery('state:deleted'), configWithDefaultExclude)!);
        expect(sql.toLowerCase()).not.toContain('not in');
        expect(params).toEqual([-1]);
    });

    it('drops the default exclusion when the field is searched for a different value', () => {
        const { sql, params } = toQuery(buildSearchWhere(parseSearchQuery('state:enabled'), configWithDefaultExclude)!);
        expect(sql.toLowerCase()).not.toContain('not in');
        expect(params).toEqual([1]);
    });
});
