import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'acorn';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateIslandsManifest, type ResolveFn } from './islands-manifest';

// Exercised against real files on disk with a real ESTree parser: the generator reads and
// esbuild-transforms sources itself, so stubbing those out would test almost nothing.
let dir: string;

beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'islands-'));
});

afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
});

function file(name: string, contents: string): string {
    const path = join(dir, name);
    writeFileSync(path, contents);
    return path;
}

/** Resolves relative specifiers against the temp dir, mapping ".js" back to its ".tsx" source. */
const resolve: ResolveFn = async (source, importer) => {
    if (!source.startsWith('.')) return null;
    const base = join(importer, '..', source);
    for (const candidate of [base, base.replace(/\.js$/, '.tsx'), base.replace(/\.js$/, '.ts')]) {
        try {
            const { existsSync } = await import('node:fs');
            if (existsSync(candidate)) return { id: candidate };
        } catch {
            /* fall through */
        }
    }
    return null;
};

// A real ESTree parser, deliberately not the one bundled inside whichever tool Vite happens to use
// internally (rollup vs. rolldown) for a given version — that choice isn't part of this package's
// dependency contract and has changed under us before.
const parseAst = (code: string) => parse(code, { ecmaVersion: 'latest', sourceType: 'module' });

const generate = (configPath: string) => generateIslandsManifest(configPath, resolve, parseAst);

describe('generateIslandsManifest', () => {
    it('maps a component to a lazy import of its own module', async () => {
        file('Video.tsx', 'export default function Video() { return null; }');
        const config = file(
            'config.tsx',
            `import Video from "./Video.js";
             export default { components: { Video } };`,
        );

        const out = await generate(config);

        expect(out).toContain('"Video"');
        expect(out).toContain('Video.tsx');
        expect(out).toContain('.then((m) => m["default"])');
    });

    it('emits a module that can be evaluated as JS', async () => {
        file('Video.tsx', 'export default function Video() { return null; }');
        const config = file(
            'config.tsx',
            `import Video from "./Video.js";
             export default { components: { Video } };`,
        );

        const out = await generate(config);

        expect(() => parseAst(out)).not.toThrow();
    });

    // The point of the analysis: emit the individual component chunk, not the whole barrel.
    it('follows a barrel re-export through to the real component module', async () => {
        file('Video.tsx', 'export default function Video() { return null; }');
        file('index.tsx', 'export { default as Video } from "./Video.js";');
        const config = file(
            'config.tsx',
            `import { Video } from "./index.js";
             export default { components: { Video } };`,
        );

        const out = await generate(config);

        expect(out).toContain('Video.tsx');
        expect(out).not.toMatch(/index\.tsx/);
    });

    it('records the named export a barrel points at', async () => {
        file('Widgets.tsx', 'export function Alpha() { return null; }');
        file('index.tsx', 'export { Alpha } from "./Widgets.js";');
        const config = file(
            'config.tsx',
            `import { Alpha } from "./index.js";
             export default { components: { Alpha } };`,
        );

        const out = await generate(config);

        expect(out).toContain('.then((m) => m["Alpha"])');
    });

    it('includes several components in one manifest', async () => {
        file('A.tsx', 'export default function A() { return null; }');
        file('B.tsx', 'export default function B() { return null; }');
        const config = file(
            'config.tsx',
            `import A from "./A.js";
             import B from "./B.js";
             export default { components: { A, B } };`,
        );

        const out = await generate(config);

        expect(out).toContain('"A"');
        expect(out).toContain('"B"');
    });

    // Inline components have no module of their own, so there is nothing to lazily import.
    it('skips components defined inline in the config', async () => {
        const config = file(
            'config.tsx',
            `export default { components: { Inline: { render: () => null } } };`,
        );

        const out = await generate(config);

        expect(out).not.toContain('"Inline"');
    });

    it('skips a component whose import cannot be resolved', async () => {
        const config = file(
            'config.tsx',
            `import Missing from "./nope.js";
             export default { components: { Missing } };`,
        );

        const out = await generate(config);

        expect(out).not.toContain('nope');
    });

    it('returns an empty manifest when the config has no components object', async () => {
        const config = file('config.tsx', 'export default { other: 1 };');

        expect(await generate(config)).toBe('export default {};\n');
    });

    // Island analysis must never be the reason a build fails.
    it('returns an empty manifest rather than throwing when the file does not exist', async () => {
        expect(await generate(join(dir, 'missing.tsx'))).toBe('export default {};\n');
    });

    it('returns an empty manifest for unparseable source', async () => {
        const config = file('config.tsx', 'this is not valid javascript {{{');

        expect(await generate(config)).toBe('export default {};\n');
    });

    it('finds the components object nested inside a definePuckConfig call', async () => {
        file('A.tsx', 'export default function A() { return null; }');
        const config = file(
            'config.tsx',
            `import A from "./A.js";
             const definePuckConfig = (c) => c;
             export default definePuckConfig({ components: { A } });`,
        );

        const out = await generate(config);

        expect(out).toContain('"A"');
    });

    it('marks the output as generated so nobody hand-edits it', async () => {
        file('A.tsx', 'export default function A() { return null; }');
        const config = file(
            'config.tsx',
            `import A from "./A.js";
             export default { components: { A } };`,
        );

        expect(await generate(config)).toContain('Do not edit');
    });
});
