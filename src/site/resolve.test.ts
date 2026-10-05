import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveSiteModule } from './resolve';

let root: string;

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'site-'));
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

function entry(dir: string, file = 'index.ts'): string {
    mkdirSync(join(root, dir), { recursive: true });
    const path = join(root, dir, file);
    writeFileSync(path, 'export default {};');
    return path;
}

describe('resolveSiteModule', () => {
    it('falls back to the empty module when nothing is configured', () => {
        expect(resolveSiteModule(root, undefined)).toBe(join(root, 'src/site/empty.ts'));
    });

    it('picks up ./sites when it has an index file', () => {
        const path = entry('sites', 'index.tsx');
        expect(resolveSiteModule(root, undefined)).toBe(path);
    });

    it('prefers PURPLEPANDA_SITE_DIR over ./sites', () => {
        entry('sites');
        const path = entry('private/acme');
        expect(resolveSiteModule(root, 'private/acme')).toBe(path);
    });

    it('fails the build when PURPLEPANDA_SITE_DIR has no index file', () => {
        mkdirSync(join(root, 'missing'));
        expect(() => resolveSiteModule(root, 'missing')).toThrow(/PURPLEPANDA_SITE_DIR/);
    });
});
