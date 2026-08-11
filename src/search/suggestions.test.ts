import { describe, expect, it } from 'vitest';
import { parseSearchQuery } from './parser';
import { buildSuggestions, valueCandidates } from './suggestions';
import type { SearchFieldSpec } from './types';

const fields: SearchFieldSpec[] = [
    { name: 'author', type: 'text' },
    { name: 'active', type: 'boolean' },
    { name: 'archived', type: 'boolean', nullable: true },
    { name: 'state', type: 'enum', enumValues: ['enabled', 'disabled', 'deleted'] },
    { name: 'created', type: 'date' },
];

/** Suggestions with the caret at the end of the query, which is where typing leaves it. */
function suggest(query: string, caret = query.length) {
    return buildSuggestions(parseSearchQuery(query), fields, caret);
}

const names = (query: string, caret?: number) =>
    suggest(query, caret).map((s) => (s.kind === 'field' ? s.field.name : s.value));

describe('valueCandidates', () => {
    it('offers both booleans for a boolean field', () => {
        expect(valueCandidates({ name: 'active', type: 'boolean' })).toEqual(['true', 'false']);
    });

    it('offers the configured literals for an enum field', () => {
        expect(valueCandidates({ name: 's', type: 'enum', enumValues: ['a', 'b'] })).toEqual(['a', 'b']);
    });

    it('offers nothing for open-ended field types', () => {
        expect(valueCandidates({ name: 'author', type: 'text' })).toEqual([]);
        expect(valueCandidates({ name: 'created', type: 'date' })).toEqual([]);
    });

    it('appends null only when the field is nullable', () => {
        expect(valueCandidates({ name: 'a', type: 'boolean', nullable: true })).toEqual([
            'true',
            'false',
            'null',
        ]);
        expect(valueCandidates({ name: 'a', type: 'boolean' })).not.toContain('null');
    });

    it('offers null alone for a nullable field with no candidate values', () => {
        expect(valueCandidates({ name: 'created', type: 'date', nullable: true })).toEqual(['null']);
    });

    it('treats an enum with no configured values as having no candidates', () => {
        expect(valueCandidates({ name: 's', type: 'enum' })).toEqual([]);
    });
});

describe('buildSuggestions', () => {
    it('offers every field on an empty query', () => {
        expect(names('')).toEqual(['author', 'active', 'archived', 'state', 'created']);
    });

    it('filters fields by what has been typed so far', () => {
        expect(names('a')).toEqual(['author', 'active', 'archived']);
    });

    it('matches field names case-insensitively', () => {
        expect(names('AUT')).toEqual(['author']);
    });

    it('offers nothing when no field name matches', () => {
        expect(names('zzz')).toEqual([]);
    });

    it('switches to value suggestions once a field prefix is committed', () => {
        expect(names('active:')).toEqual(['true', 'false']);
    });

    it('filters values by the partially typed value', () => {
        expect(names('active:t')).toEqual(['true']);
    });

    it('matches values case-insensitively', () => {
        expect(names('state:DIS')).toEqual(['disabled']);
    });

    it('offers enum values for an enum field', () => {
        expect(names('state:')).toEqual(['enabled', 'disabled', 'deleted']);
    });

    it('includes null for a nullable field', () => {
        expect(names('archived:')).toContain('null');
    });

    it('offers nothing for a field with no enumerable values', () => {
        expect(names('created:')).toEqual([]);
    });

    it('offers nothing for an unrecognized field name', () => {
        expect(names('bogus:')).toEqual([]);
    });

    it('returns typed suggestion kinds so the caller can tell them apart', () => {
        expect(suggest('a')[0]).toMatchObject({ kind: 'field' });
        expect(suggest('active:')[0]).toMatchObject({ kind: 'value', value: 'true' });
    });

    it('suggests for the term the caret is inside, not the last one typed', () => {
        // Caret sits inside "active:" (offsets 0-7), not the trailing "auth".
        expect(names('active: auth', 7)).toEqual(['true', 'false']);
    });

    it('offers all fields when the caret is in whitespace between terms', () => {
        const result = names('author:jane ', 12);

        expect(result).toContain('author');
        expect(result).toContain('state');
    });
});
