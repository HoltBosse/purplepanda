import { describe, it, expect } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { eq } from 'drizzle-orm';
import { parseSearchQuery } from './parser';
import { buildSearchWhere } from './drizzle';
import type { DrizzleSearchConfig } from './drizzle';
import { documents, users, userActions } from '../db/schema';

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
        expect(sql).toContain('websearch_to_tsquery');
        expect(sql).not.toMatch(/\blike\b/i);
        expect(params).toContain('foo');
    });

    it('splits non-alphanumerics on both sides so URLs/paths are searchable by their parts', () => {
        // Postgres lexes 'https://xkcd.com/1360/' as indivisible url tokens, so without this the
        // tsquery for "xkcd" could never match a URL column.
        const { sql, params } = toQuery(buildSearchWhere(parseSearchQuery('xkcd.com'), baseConfig)!);
        expect(sql).toContain('regexp_replace');
        expect(params).toContain('xkcd com');
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
