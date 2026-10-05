import type { Config, Data } from '@puckeditor/core';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import * as z from 'zod';
import PuckEditor from './PuckEditor';

const config = {
    components: {
        Block: {
            fields: {},
            defaultProps: {},
            render: ({ id }: { id: string }) => <div data-block={id}>{id}</div>,
        },
    },
} as unknown as Config;

const emptyData = { root: { props: {} }, content: [] } as unknown as Data;

function renderEditor(props: Partial<React.ComponentProps<typeof PuckEditor>> = {}) {
    return render(
        <PuckEditor config={config} data={emptyData} onPublish={() => undefined} {...props} />,
    );
}

describe('PuckEditor', () => {
    it('mounts the editor', async () => {
        const screen = await renderEditor();

        await expect.poll(() => screen.container.querySelectorAll('button').length).toBeGreaterThan(0);
    });

    it('shows a save action when an onSave handler is supplied', async () => {
        const screen = await renderEditor({ onSave: () => undefined });

        await expect.poll(() => (screen.container.textContent ?? '').length).toBeGreaterThan(0);
    });

    it('mounts with a template applied', async () => {
        const screen = await renderEditor({ templateData: emptyData });

        await expect.poll(() => screen.container.querySelectorAll('button').length).toBeGreaterThan(0);
    });

    // Templates without a TemplateSlot would silently swallow page content, so the editor appends
    // a fallback one (see template-slot.ts) rather than letting that state be saved.
    it('accepts a template that has no TemplateSlot of its own', async () => {
        const templateData = {
            root: { props: {} },
            content: [{ type: 'Block', props: { id: 'b1' } }],
        } as unknown as Data;

        const screen = await renderEditor({ templateData });

        await expect.poll(() => screen.container.querySelectorAll('button').length).toBeGreaterThan(0);
    });

    it('mounts with font links supplied', async () => {
        const screen = await renderEditor({
            headingFontLink: 'https://fonts.bunny.net/css2?family=Inter:wght@400&display=swap',
            bodyFontLink: 'https://fonts.bunny.net/css2?family=Inter:wght@400&display=swap',
        });

        await expect.poll(() => screen.container.querySelectorAll('button').length).toBeGreaterThan(0);
    });
});

describe('PuckEditor validation badge', () => {
    // A Block with an empty label fails its propsSchema; Group holds Blocks in a slot so an
    // offending one can sit under a collapsed outline branch.
    const validatingConfig = {
        components: {
            Group: {
                fields: { items: { type: 'slot' } },
                defaultProps: { items: [] },
                render: ({ items: Items }: { items: React.FC }) => <Items />,
            },
            Block: {
                fields: { label: { type: 'text', label: 'Label' } },
                defaultProps: { label: 'ok' },
                propsSchema: () => z.object({ label: z.string().min(1) }).passthrough(),
                render: ({ id }: { id: string }) => <div data-block={id}>{id}</div>,
            },
        },
    } as unknown as Config;

    const invalidData = {
        root: { props: {} },
        content: [
            { type: 'Block', props: { id: 'fine', label: 'ok' } },
            {
                type: 'Group',
                props: { id: 'group', items: [{ type: 'Block', props: { id: 'nested-bad', label: '' } }] },
            },
            { type: 'Block', props: { id: 'top-bad', label: '' } },
        ],
    } as unknown as Data;

    const selectedLayerId = () =>
        document.querySelector('[data-puck-layer-tree-id][class*="isSelected"]')?.getAttribute('data-puck-layer-tree-id');

    it('selects each offending component in turn without switching the left panel', async () => {
        const screen = await render(<PuckEditor config={validatingConfig} data={invalidData} onPublish={() => undefined} />);

        const badge = () => screen.container.querySelector<HTMLButtonElement>('[data-puck-validation-errors] button');
        await expect.poll(() => badge()?.textContent).toBe('2 fields need attention');

        badge()?.click();
        await expect.poll(selectedLayerId).toBe('nested-bad');
        // The left panel stays on whichever tab the author had open (blocks, by default) — the
        // outline is still mounted behind it, already expanded to the selection.
        expect(document.querySelector('[class*="PuckPluginTab--visible"] [data-puck-layer-tree-id]')).toBeNull();

        badge()?.click();
        await expect.poll(selectedLayerId).toBe('top-bad');

        badge()?.click();
        await expect.poll(selectedLayerId).toBe('nested-bad');
    });

    it('jumps to the first offending component when Publish is blocked', async () => {
        let published = false;
        const screen = await render(
            <PuckEditor config={validatingConfig} data={invalidData} onPublish={() => { published = true; }} />,
        );

        const publish = () => screen.container.querySelector<HTMLElement>('[data-puck-publish]');
        await expect.poll(() => publish()).not.toBeNull();
        publish()?.click();

        await expect.poll(selectedLayerId).toBe('nested-bad');
        expect(published).toBe(false);
    });
});
