import { describe, expect, it } from 'vitest';
import { sameOriginReferer } from './referer';

function context(referer: string | null) {
    const headers = new Headers();
    if (referer !== null) headers.set('referer', referer);
    return { request: new Request('https://example.com/admin/x/toggle/1', { method: 'POST', headers }), url: new URL('https://example.com/admin/x/toggle/1') };
}

describe('sameOriginReferer', () => {
    it('returns the path and query of a same-origin referer', () => {
        expect(sameOriginReferer(context('https://example.com/admin/pages?q=a&page=2'))).toBe('/admin/pages?q=a&page=2');
    });

    it('ignores a missing, malformed or cross-origin referer', () => {
        expect(sameOriginReferer(context(null))).toBeNull();
        expect(sameOriginReferer(context('not a url'))).toBeNull();
        expect(sameOriginReferer(context('https://evil.example/admin'))).toBeNull();
        expect(sameOriginReferer(context('http://example.com/admin'))).toBeNull();
    });
});
