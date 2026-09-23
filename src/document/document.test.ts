import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getDocumentPath } from './document.js';

describe('document path', () => {
    afterEach(() => {
        delete process.env.DOCUMENT_PATH;
    });

    it('defaults to ./documents under the project root', () => {
        expect(getDocumentPath()).toBe(resolve('documents'));
    });

    it('honours DOCUMENT_PATH', () => {
        process.env.DOCUMENT_PATH = '/tmp/documents';
        expect(getDocumentPath()).toBe('/tmp/documents');
    });
});
