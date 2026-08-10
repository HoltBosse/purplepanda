import { beforeEach, describe, expect, it } from 'vitest';
import { getDocumentPath, setDocumentPath } from './document';

const GLOBAL_KEY = '__purplepanda_document_path';

describe('document path', () => {
    beforeEach(() => {
        delete (globalThis as Record<string, unknown>)[GLOBAL_KEY];
    });

    it('throws when no path has been set', () => {
        expect(() => getDocumentPath()).toThrow(/documentPath/);
    });

    it('returns the path after it is set', () => {
        setDocumentPath('/tmp/documents');
        expect(getDocumentPath()).toBe('/tmp/documents');
    });

    it('reflects the most recently set path', () => {
        setDocumentPath('/a');
        setDocumentPath('/b');
        expect(getDocumentPath()).toBe('/b');
    });
});
