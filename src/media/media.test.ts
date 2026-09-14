import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('media path', () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it('returns the path supplied by the integration', async () => {
        vi.doMock('virtual:purplepanda/media-path', () => ({ default: '/tmp/media' }));
        const { getMediaPath } = await import('./media');
        expect(getMediaPath()).toBe('/tmp/media');
    });
});
