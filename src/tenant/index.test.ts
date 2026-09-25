import { describe, expect, it } from 'vitest';
import { domainSchema, normalizeDomain, parseDomainInput, parseDomainList, pickPrimaryDomain, urlOnDomain } from './index';

describe('normalizeDomain', () => {
    it('lowercases and drops a fully-qualified trailing dot', () => {
        expect(normalizeDomain('WWW.Example.COM.')).toBe('www.example.com');
    });

    it('accepts single-label hosts, subdomains and IPv4 literals', () => {
        expect(normalizeDomain('localhost')).toBe('localhost');
        expect(normalizeDomain('blog.example.co.uk')).toBe('blog.example.co.uk');
        expect(normalizeDomain('127.0.0.1')).toBe('127.0.0.1');
    });

    it('rejects anything that is not a bare hostname', () => {
        for (const bad of ['', 'example.com:3000', 'example.com/path', 'bad domain', '-example.com', 'example-.com', 'a..b', 'ex_ample.com', `${'a'.repeat(64)}.com`]) {
            expect(normalizeDomain(bad), bad).toBeNull();
        }
    });
});

describe('parseDomainInput', () => {
    it('tolerates a pasted URL’s scheme and trailing slash', () => {
        expect(parseDomainInput(' https://Example.com/ ')).toBe('example.com');
        expect(parseDomainInput('http://blog.example.com')).toBe('blog.example.com');
    });

    it('still rejects a path or port', () => {
        expect(parseDomainInput('https://example.com/blog')).toBeNull();
        expect(parseDomainInput('https://example.com:8443')).toBeNull();
    });
});

describe('parseDomainList', () => {
    it('splits on newlines and commas, skipping blanks and collapsing duplicates', () => {
        expect(parseDomainList('example.com\n\nWWW.example.com, example.com\r\n')).toEqual({
            domains: ['example.com', 'www.example.com'],
            invalid: [],
        });
    });

    it('reports what did not parse, as typed', () => {
        expect(parseDomainList('example.com\nnot a domain')).toEqual({
            domains: ['example.com'],
            invalid: ['not a domain'],
        });
    });
});

describe('pickPrimaryDomain', () => {
    it('prefers a real hostname over localhost, then the shortest', () => {
        expect(pickPrimaryDomain(['localhost', 'www.example.com', 'example.com'])).toBe('example.com');
        expect(pickPrimaryDomain(['localhost'])).toBe('localhost');
        expect(pickPrimaryDomain([])).toBeUndefined();
    });
});

describe('urlOnDomain', () => {
    it('keeps the current scheme and port', () => {
        expect(urlOnDomain(new URL('http://localhost:3012/login'), 'blog.localhost', '/admin')).toBe('http://blog.localhost:3012/admin');
        expect(urlOnDomain(new URL('https://example.com/login'), 'other.dev', '/admin/sso?token=x')).toBe('https://other.dev/admin/sso?token=x');
    });
});

describe('domainSchema', () => {
    it('normalizes a valid hostname', () => {
        expect(domainSchema.parse('WWW.Example.com.')).toBe('www.example.com');
    });

    it('rejects a non-hostname or a non-string', () => {
        expect(domainSchema.safeParse('evil.example/path').success).toBe(false);
        expect(domainSchema.safeParse(42).success).toBe(false);
        expect(domainSchema.safeParse(null).success).toBe(false);
    });
});
