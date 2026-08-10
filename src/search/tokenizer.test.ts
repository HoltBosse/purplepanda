import { describe, expect, it } from 'vitest';
import { tokenize } from './tokenizer';

describe('tokenize', () => {
    it('returns no tokens for an empty or whitespace-only string', () => {
        expect(tokenize('')).toEqual([]);
        expect(tokenize('   \t\n  ')).toEqual([]);
    });

    it('splits bare words on whitespace', () => {
        const tokens = tokenize('foo bar  baz');
        expect(tokens.map((t) => t.value)).toEqual(['foo', 'bar', 'baz']);
        expect(tokens.every((t) => !t.quoted && t.field === undefined)).toBe(true);
    });

    it('captures raw and offsets for a bare token', () => {
        const [token] = tokenize('  foo  ');
        expect(token).toMatchObject({ value: 'foo', raw: 'foo', start: 2, end: 5 });
    });

    it('parses a field:value token', () => {
        const [token] = tokenize('name:foo');
        expect(token).toMatchObject({ field: 'name', value: 'foo', quoted: false });
    });

    it('does not treat a leading digit or colon-less word as a field prefix', () => {
        const [token] = tokenize('2foo:bar');
        expect(token).toMatchObject({ field: undefined, value: '2foo:bar' });
    });

    it('parses a single-quoted value, unwrapping the quotes', () => {
        const [token] = tokenize("'hello world'");
        expect(token).toMatchObject({ value: 'hello world', quoted: true, raw: "'hello world'" });
    });

    it('parses a double-quoted value, unwrapping the quotes', () => {
        const [token] = tokenize('"hello world"');
        expect(token).toMatchObject({ value: 'hello world', quoted: true, raw: '"hello world"' });
    });

    it('resolves backslash escapes inside a quoted value', () => {
        const [token] = tokenize(String.raw`"she said \"hi\""`);
        expect(token).toMatchObject({ value: 'she said "hi"', quoted: true });
    });

    it('does not resolve escapes in an unquoted value', () => {
        const [token] = tokenize(String.raw`foo\bar`);
        expect(token).toMatchObject({ value: String.raw`foo\bar`, quoted: false });
    });

    it('treats an unterminated quote as running to end of input', () => {
        const [token] = tokenize('"unterminated value');
        expect(token).toMatchObject({ value: 'unterminated value', quoted: true });
    });

    it('parses a field:value with a quoted value', () => {
        const [token] = tokenize('name:"Jane Doe"');
        expect(token).toMatchObject({ field: 'name', value: 'Jane Doe', quoted: true });
    });

    it('parses relational operators after a field prefix on an unquoted value', () => {
        expect(tokenize('created:>2020-01-01')[0]).toMatchObject({ operator: 'gt', value: '2020-01-01' });
        expect(tokenize('created:>=2020-01-01')[0]).toMatchObject({ operator: 'gte', value: '2020-01-01' });
        expect(tokenize('created:<2020-01-01')[0]).toMatchObject({ operator: 'lt', value: '2020-01-01' });
        expect(tokenize('created:<=2020-01-01')[0]).toMatchObject({ operator: 'lte', value: '2020-01-01' });
    });

    it('leaves operator undefined when none is written after a field prefix', () => {
        expect(tokenize('created:2020-01-01')[0]).toMatchObject({ operator: undefined });
    });

    it('does not recognize an operator without a field prefix', () => {
        const [token] = tokenize('>2020-01-01');
        expect(token).toMatchObject({ field: undefined, operator: undefined, value: '>2020-01-01' });
    });

    it('strips a leading operator even when what follows looks like a quote, treating the rest as unquoted text', () => {
        const [token] = tokenize('created:>"2020-01-01"');
        // Whether to lex a quoted value is decided before the operator is stripped, so a quote
        // immediately after the operator is just literal text, not the start of a quoted value.
        expect(token).toMatchObject({ field: 'created', operator: 'gt', quoted: false, value: '"2020-01-01"' });
    });

    it('tokenizes a mix of quoted and unquoted terms in one query', () => {
        const tokens = tokenize(`name:"Jane Doe" active:true 'exact phrase' bare`);
        expect(tokens.map((t) => t.value)).toEqual(['Jane Doe', 'true', 'exact phrase', 'bare']);
        expect(tokens[0]).toMatchObject({ field: 'name', quoted: true });
        expect(tokens[1]).toMatchObject({ field: 'active', quoted: false });
        expect(tokens[2]).toMatchObject({ field: undefined, quoted: true });
        expect(tokens[3]).toMatchObject({ field: undefined, quoted: false });
    });

    it('treats an empty quoted value as a zero-length token rather than skipping it', () => {
        const tokens = tokenize(`"" foo`);
        expect(tokens).toHaveLength(2);
        expect(tokens[0]).toMatchObject({ value: '', quoted: true });
    });
});
