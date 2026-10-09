import type { Config, Data } from '@puckeditor/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { pageRootPropsSchema } from '../../puck/page-root-schema';
import PuckEditor from '../PuckEditor';

const config = {
    components: {
        Block: {
            fields: { label: { type: 'text', label: 'Label' } },
            defaultProps: { label: 'Block' },
            render: ({ id, label }: { id: string; label: string }) => <div data-block={id}>{label}</div>,
        },
    },
} as unknown as Config;

const emptyData = { root: { props: {} }, content: [] } as unknown as Data;

const edited = {
    root: { props: {} },
    content: [{ type: 'Block', props: { id: 'Block-new', label: 'Made by AI' } }],
} as unknown as Data;

function ndjson(events: unknown[]): Response {
    return new Response(events.map((event) => `${JSON.stringify(event)}\n`).join(''), {
        headers: { 'content-type': 'application/x-ndjson' },
    });
}

const canvas = () => document.querySelector<HTMLIFrameElement>('iframe#preview-frame')?.contentDocument;

// The tab only shows when the layout says an AI key is configured (see puck/ai/enabled.ts).
beforeEach(() => {
    (window as { __PP_AI_ENABLED?: boolean }).__PP_AI_ENABLED = true;
});

afterEach(() => {
    vi.restoreAllMocks();
    delete (window as { __PP_AI_ENABLED?: boolean }).__PP_AI_ENABLED;
});

it('hides the AI tab when no AI key is configured', async () => {
    delete (window as { __PP_AI_ENABLED?: boolean }).__PP_AI_ENABLED;
    const screen = await render(<PuckEditor config={config} data={emptyData} onPublish={() => undefined} />);
    await expect.element(screen.getByRole('list').getByText('Outline', { exact: true })).toBeVisible();
    expect(screen.getByText('AI', { exact: true }).query()).toBeNull();
});

describe('AI tab', () => {
    it('sends the document and page settings catalog, then applies the returned document', async () => {
        const fetchMock = vi.spyOn(window, 'fetch').mockResolvedValue(
            ndjson([
                { type: 'status', text: 'Adding 1 component' },
                { type: 'data', data: edited },
                { type: 'text', text: 'Added a block.' },
                { type: 'usage', usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 4000, cacheWriteTokens: 0, costUsd: 0.0005 } },
            ]),
        );

        const screen = await render(<PuckEditor config={config} data={emptyData} onPublish={() => undefined} />);

        await screen.getByText('AI', { exact: true }).click();
        await expect.poll(() => document.querySelector('[data-ai-panel] textarea')).not.toBeNull();

        const textarea = document.querySelector<HTMLTextAreaElement>('[data-ai-panel] textarea')!;
        await screen.getByPlaceholder('Ask for a change…').fill('Add a block');
        textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

        await expect.poll(() => canvas()?.querySelector('[data-block="Block-new"]')?.textContent).toBe('Made by AI');
        await expect.poll(() => document.querySelector('[data-ai-message="assistant"]')?.textContent ?? '').toContain('Added a block.');
        expect(document.querySelector('[data-ai-message="assistant"]')?.textContent).toContain('Adding 1 component');

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('/admin/ai/chat');
        const payload = JSON.parse(String((init.body as FormData).get('payload')));
        expect(payload).toMatchObject({ message: 'Add a block', location: 'page', selectedId: null, history: [] });
        expect(payload.rootCatalog).toContain('## root (page settings; update with id "root")');
        expect(payload).not.toHaveProperty('catalog');
        expect(JSON.parse(payload.data)).toMatchObject(emptyData);
    });

    it('shows a server error without touching the document', async () => {
        vi.spyOn(window, 'fetch').mockResolvedValue(
            new Response(JSON.stringify({ error: 'Usage limit reached.' }), { status: 429, headers: { 'content-type': 'application/json' } }),
        );

        const screen = await render(
            <PuckEditor config={config} data={{ root: { props: {} }, content: [{ type: 'Block', props: { id: 'keep', label: 'Keep me' } }] } as unknown as Data} onPublish={() => undefined} />,
        );

        await screen.getByText('AI', { exact: true }).click();
        await screen.getByPlaceholder('Ask for a change…').fill('Do something');
        document.querySelector<HTMLButtonElement>('[data-ai-panel] button[aria-label="Send"]')?.click();

        await expect.poll(() => document.querySelector('[data-ai-message="assistant"]')?.textContent ?? '').toContain('Usage limit reached.');
        expect(canvas()?.querySelector('[data-block="keep"]')?.textContent).toBe('Keep me');
    });

    it('sends what the "fields need attention" badge lists, and which page schema applies', async () => {
        const fetchMock = vi.spyOn(window, 'fetch').mockResolvedValue(ndjson([{ type: 'text', text: 'Fixed.' }]));
        const screen = await render(
            <PuckEditor
                config={{ ...config, root: { fields: { title: { type: 'text' }, alias: { type: 'text' } } } } as unknown as Config}
                data={{ root: { props: { title: 'Hello', alias: '' } }, content: [] } as unknown as Data}
                rootPropsSchema={pageRootPropsSchema}
                onPublish={() => undefined}
            />,
        );

        await screen.getByText('AI', { exact: true }).click();
        await screen.getByPlaceholder('Ask for a change…').fill('fix the fields needing attention');
        document.querySelector<HTMLButtonElement>('[data-ai-panel] button[aria-label="Send"]')?.click();

        await expect.poll(() => fetchMock.mock.calls.length).toBe(1);
        const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        const payload = JSON.parse(String((init.body as FormData).get('payload')));
        expect(payload.rootSchema).toBe('page');
        expect(payload.attention).toEqual([{ componentId: 'root', componentType: 'Page', field: 'alias', message: 'Alias is required' }]);
    });
});
