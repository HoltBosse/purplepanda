import { beforeEach, describe, expect, it } from 'vitest';
import { getMediaPath, setMediaPath } from './media';

const GLOBAL_KEY = '__purplepanda_media_path';

describe('media path', () => {
    beforeEach(() => {
        delete (globalThis as Record<string, unknown>)[GLOBAL_KEY];
    });

    it('throws when no path has been set', () => {
        expect(() => getMediaPath()).toThrow(/mediaPath/);
    });

    it('returns the path after it is set', () => {
        setMediaPath('/tmp/media');
        expect(getMediaPath()).toBe('/tmp/media');
    });

    it('reflects the most recently set path', () => {
        setMediaPath('/a');
        setMediaPath('/b');
        expect(getMediaPath()).toBe('/b');
    });
});
