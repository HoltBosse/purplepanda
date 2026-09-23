import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getMediaPath } from './media.js';

describe('media path', () => {
    afterEach(() => {
        delete process.env.MEDIA_PATH;
    });

    it('defaults to ./media under the project root', () => {
        expect(getMediaPath()).toBe(resolve('media'));
    });

    it('honours MEDIA_PATH', () => {
        process.env.MEDIA_PATH = '/tmp/media';
        expect(getMediaPath()).toBe('/tmp/media');
    });
});
