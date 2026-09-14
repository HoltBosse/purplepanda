import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('document path', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it('throws when no document path was configured', async () => {
        vi.doMock('virtual:purplepanda/document-path', () => ({ default: null }));
        const { getDocumentPath } = await import('./document');
        expect(() => getDocumentPath()).toThrow(/documentPath/);
    });

    it('returns the path when configured', async () => {
        vi.doMock('virtual:purplepanda/document-path', () => ({ default: '/tmp/documents' }));
        const { getDocumentPath } = await import('./document');
        expect(getDocumentPath()).toBe('/tmp/documents');
    });
});
