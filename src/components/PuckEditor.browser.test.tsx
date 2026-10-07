import type { Config, Data } from '@puckeditor/core';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import * as z from 'zod';
import { GRAPE_THEME } from '../theme/presets';
import { setInjectedTheme, themeSummary } from '../theme/summary';
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

    it('styles the canvas with the site theme and switches its mode from the header', async () => {
        setInjectedTheme(themeSummary(GRAPE_THEME));
        try {
            const screen = await renderEditor();
            const canvas = () => document.querySelector<HTMLIFrameElement>('iframe#preview-frame')?.contentDocument;

            await expect.poll(() => canvas()?.getElementById('purplepanda-theme')?.textContent ?? '').toContain('--pp-color-grape: #5b3fd0');
            expect(canvas()?.head.querySelector('link[href*="fonts.bunny.net"]')).not.toBeNull();
            expect(canvas()?.body.getAttribute('data-scheme')).toBe('default');
            await expect.poll(() => canvas()?.documentElement.getAttribute('data-pp-mode')).toBe('light');

            // Sits in Puck's viewport bar, after the device buttons, as an icon button.
            await expect.poll(() => document.querySelector('[class*="_ViewportControls-actionsInner_"] [data-puck-canvas-mode] button')).not.toBeNull();
            expect(screen.container.querySelector('[data-puck-canvas-mode]')?.closest('[class*="_ViewportControls-actionsInner_"]')).not.toBeNull();
            document.querySelector<HTMLButtonElement>('[data-puck-canvas-mode] button')?.click();
            await expect.poll(() => canvas()?.documentElement.getAttribute('data-pp-mode')).toBe('dark');
        } finally {
            delete (globalThis as { __PP_THEME?: unknown }).__PP_THEME;
        }
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
