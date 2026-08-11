// The five editor wrappers are thin: each picks a Puck config subset and wires up save/publish
// URLs. These mount each one for real to catch the failure that thin wrappers actually have —
// blowing up on load, or dropping the editor entirely — which no amount of prop plumbing review
// would surface.
import type { Data } from '@puckeditor/core';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import ContentPuckEditor from './ContentPuckEditor';
import FormPuckEditor from './FormPuckEditor';
import PagePuckEditor from './PagePuckEditor';
import PrefabPuckEditor from './PrefabPuckEditor';
import TemplatePuckEditor from './TemplatePuckEditor';

const emptyData = { root: { props: {} }, content: [] } as unknown as Data;

/** Puck renders its own chrome; any of these means the editor actually mounted. */
function mounted(root: HTMLElement): boolean {
    return (
        root.querySelector('[class*="Puck"]') !== null ||
        root.querySelector('button') !== null ||
        (root.textContent ?? '').length > 0
    );
}

describe('PagePuckEditor', () => {
    it('mounts the editor', async () => {
        const screen = await render(<PagePuckEditor initialData={emptyData} />);

        await expect.poll(() => mounted(screen.container)).toBe(true);
    });

    it('mounts with a template applied', async () => {
        const screen = await render(
            <PagePuckEditor initialData={emptyData} templateData={emptyData} />,
        );

        await expect.poll(() => mounted(screen.container)).toBe(true);
    });
});

describe('TemplatePuckEditor', () => {
    it('mounts the editor', async () => {
        const screen = await render(<TemplatePuckEditor initialData={emptyData} />);

        await expect.poll(() => mounted(screen.container)).toBe(true);
    });
});

describe('ContentPuckEditor', () => {
    it('mounts the editor', async () => {
        const screen = await render(<ContentPuckEditor initialData={emptyData} contentTypeId="post" />);

        await expect.poll(() => mounted(screen.container)).toBe(true);
    });
});

describe('FormPuckEditor', () => {
    it('mounts the editor', async () => {
        const screen = await render(<FormPuckEditor initialData={emptyData} />);

        await expect.poll(() => mounted(screen.container)).toBe(true);
    });
});

describe('PrefabPuckEditor', () => {
    it('mounts the editor', async () => {
        const screen = await render(<PrefabPuckEditor initialData={emptyData} />);

        await expect.poll(() => mounted(screen.container)).toBe(true);
    });
});
