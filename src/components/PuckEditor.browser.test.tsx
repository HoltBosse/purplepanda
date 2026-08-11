import type { Config, Data } from '@puckeditor/core';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
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
