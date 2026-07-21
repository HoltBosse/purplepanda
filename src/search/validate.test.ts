import { describe, it, expect } from 'vitest';
import { parseSearchQuery } from './parser';
import { validateSearchAst } from './validate';
import type { SearchFieldSpec } from './types';

const fields: SearchFieldSpec[] = [
    { name: 'name', type: 'text' },
    { name: 'member', type: 'boolean', nullable: true },
    { name: 'created', type: 'date' },
    { name: 'meeting', type: 'datetime' },
    { name: 'starts', type: 'time' },
    { name: 'state', type: 'enum', enumValues: ['enabled', 'disabled', 'deleted'] },
    { name: 'strict', type: 'text', wildcard: false },
];

function validateOne(query: string) {
    const [result] = validateSearchAst(parseSearchQuery(query), fields);
    if (!result) throw new Error('expected exactly one term');
    return result;
}

describe('validateSearchAst', () => {
    it('always accepts bare text terms', () => {
        expect(validateOne('anything')).toMatchObject({ valid: true });
    });

    it('rejects an unknown field', () => {
        expect(validateOne('bogus:foo')).toMatchObject({ valid: false, error: expect.stringContaining('bogus') });
    });

    it('accepts a matching text field value and resolves its config', () => {
        const result = validateOne('name:foo');
        expect(result.valid).toBe(true);
        expect(result.field?.name).toBe('name');
    });

    it('accepts true/false for a boolean field and rejects anything else', () => {
        expect(validateOne('member:true')).toMatchObject({ valid: true });
        expect(validateOne('member:false')).toMatchObject({ valid: true });
        expect(validateOne('member:maybe')).toMatchObject({ valid: false });
    });

    it('accepts null only for a nullable field', () => {
        expect(validateOne('member:null')).toMatchObject({ valid: true });
        // A non-nullable *text* field still legitimately matches "null" as a literal string...
        expect(validateOne('name:null')).toMatchObject({ valid: true });
        // ...but a non-nullable field of any other type rejects it, since it's neither the null
        // literal (not allowed here) nor a valid value of that type.
        expect(validateOne('state:null')).toMatchObject({ valid: false });
    });

    it('validates date values by shape', () => {
        expect(validateOne('created:2020-01-01')).toMatchObject({ valid: true });
        expect(validateOne('created:2020-01-99')).toMatchObject({ valid: false });
        expect(validateOne('created:not-a-date')).toMatchObject({ valid: false });
    });

    it('validates datetime values, accepting a bare date too', () => {
        expect(validateOne('meeting:2020-01-01T10:00')).toMatchObject({ valid: true });
        expect(validateOne('meeting:2020-01-01T10:00:00')).toMatchObject({ valid: true });
        expect(validateOne('meeting:2020-01-01')).toMatchObject({ valid: true });
        expect(validateOne('meeting:not-a-datetime')).toMatchObject({ valid: false });
    });

    it('validates time values', () => {
        expect(validateOne('starts:10:00')).toMatchObject({ valid: true });
        expect(validateOne('starts:10:00:00')).toMatchObject({ valid: true });
        expect(validateOne('starts:nope')).toMatchObject({ valid: false });
    });

    it('validates enum values against the configured list', () => {
        expect(validateOne('state:enabled')).toMatchObject({ valid: true });
        expect(validateOne('state:archived')).toMatchObject({ valid: false });
    });

    it('rejects a wildcard value for a non-text field', () => {
        expect(validateOne('state:enab*')).toMatchObject({ valid: false });
    });

    it('accepts a wildcard value for a text field by default', () => {
        expect(validateOne('name:foo*bar')).toMatchObject({ valid: true });
    });

    it('rejects a wildcard value when the field opts out of wildcards', () => {
        expect(validateOne('strict:foo*bar')).toMatchObject({ valid: false });
    });

    it('validates every term in a composite query independently', () => {
        const results = validateSearchAst(parseSearchQuery('state:enabled bogus:x free text'), fields);
        expect(results.map((r) => r.valid)).toEqual([true, false, true, true]);
    });
});
