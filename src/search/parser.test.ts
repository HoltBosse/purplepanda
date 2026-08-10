import { describe, expect, it } from 'vitest';
import { parseSearchQuery } from './parser';

describe('parseSearchQuery', () => {
    it('parses a bare unquoted word as a case-insensitive text term', () => {
        const [term] = parseSearchQuery('foo');
        expect(term).toMatchObject({ kind: 'text', value: 'foo', quoted: false, caseSensitive: false });
    });

    it('parses a single-quoted word as a case-sensitive text term', () => {
        const [term] = parseSearchQuery("'foo'");
        expect(term).toMatchObject({ kind: 'text', value: 'foo', quoted: true, caseSensitive: true });
    });

    it('parses a double-quoted word as a case-sensitive text term', () => {
        const [term] = parseSearchQuery('"foo"');
        expect(term).toMatchObject({ kind: 'text', value: 'foo', quoted: true, caseSensitive: true });
    });

    it('parses a field:value term', () => {
        const [term] = parseSearchQuery('name:foo');
        expect(term).toMatchObject({ kind: 'field', field: 'name', value: 'foo', wildcard: false });
    });

    it('flags * and ? in an unquoted field value as a wildcard', () => {
        expect(parseSearchQuery('name:foo*bar')[0]).toMatchObject({ kind: 'field', wildcard: true, value: 'foo*bar' });
        expect(parseSearchQuery('name:foo?bar')[0]).toMatchObject({ kind: 'field', wildcard: true, value: 'foo?bar' });
    });

    it('does not treat a quoted field value as a wildcard even if it contains * or ?', () => {
        const [term] = parseSearchQuery('name:"foo*bar"');
        expect(term).toMatchObject({ kind: 'field', wildcard: false, quoted: true, value: 'foo*bar' });
    });

    it('parses boolean and null field values as plain text at the syntax level', () => {
        expect(parseSearchQuery('member:true')[0]).toMatchObject({ kind: 'field', field: 'member', value: 'true' });
        expect(parseSearchQuery('member:false')[0]).toMatchObject({ kind: 'field', field: 'member', value: 'false' });
        expect(parseSearchQuery('member:null')[0]).toMatchObject({ kind: 'field', field: 'member', value: 'null' });
    });

    it('parses a date field value', () => {
        expect(parseSearchQuery('created:2020-01-01')[0]).toMatchObject({
            kind: 'field',
            field: 'created',
            value: '2020-01-01',
        });
    });

    it('defaults a field term to the eq operator when none is written', () => {
        expect(parseSearchQuery('created:2020-01-01')[0]).toMatchObject({ operator: 'eq' });
    });

    it('parses a relational operator prefix on a field value', () => {
        expect(parseSearchQuery('created:>2020-01-01')[0]).toMatchObject({ operator: 'gt', value: '2020-01-01' });
        expect(parseSearchQuery('created:>=2020-01-01')[0]).toMatchObject({ operator: 'gte', value: '2020-01-01' });
        expect(parseSearchQuery('created:<2020-01-01')[0]).toMatchObject({ operator: 'lt', value: '2020-01-01' });
        expect(parseSearchQuery('created:<=2020-01-01')[0]).toMatchObject({ operator: 'lte', value: '2020-01-01' });
    });

    it('keeps the full operator+value span in raw/start/end', () => {
        const [term] = parseSearchQuery('created:>=2020-01-01');
        expect(term).toMatchObject({ raw: 'created:>=2020-01-01', start: 0, end: 20 });
    });

    it('does not recognize an operator prefix on a quoted field value', () => {
        const [term] = parseSearchQuery('created:">2020-01-01"');
        expect(term).toMatchObject({ operator: 'eq', value: '>2020-01-01', quoted: true });
    });

    it('does not recognize an operator prefix on a bare text term', () => {
        const [term] = parseSearchQuery('>foo');
        expect(term).toMatchObject({ kind: 'text', value: '>foo' });
    });

    it('parses a quoted value containing spaces', () => {
        const [term] = parseSearchQuery('name:"foo bar"');
        expect(term).toMatchObject({ kind: 'field', field: 'name', value: 'foo bar', quoted: true });
    });

    it('honors backslash escapes inside quotes', () => {
        const [term] = parseSearchQuery(String.raw`'foo\'bar'`);
        expect(term).toMatchObject({ kind: 'text', value: "foo'bar" });
    });

    it('parses a full composite query into ordered terms', () => {
        const terms = parseSearchQuery('foo:bar marco:polo searchterm');
        expect(terms).toHaveLength(3);
        expect(terms[0]).toMatchObject({ kind: 'field', field: 'foo', value: 'bar' });
        expect(terms[1]).toMatchObject({ kind: 'field', field: 'marco', value: 'polo' });
        expect(terms[2]).toMatchObject({ kind: 'text', value: 'searchterm' });
    });

    it('tracks accurate start/end offsets for each term', () => {
        const terms = parseSearchQuery('foo bar:baz');
        expect(terms[0]).toMatchObject({ start: 0, end: 3, raw: 'foo' });
        expect(terms[1]).toMatchObject({ start: 4, end: 11, raw: 'bar:baz' });
    });

    it('collapses arbitrary whitespace between terms', () => {
        const terms = parseSearchQuery('  foo   bar:baz  ');
        expect(terms).toHaveLength(2);
    });

    it('returns an empty array for an empty or whitespace-only query', () => {
        expect(parseSearchQuery('')).toEqual([]);
        expect(parseSearchQuery('   ')).toEqual([]);
    });
});
