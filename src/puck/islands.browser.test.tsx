import type { Config } from '@puckeditor/core';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import { ISLAND_NAME_ATTR, ISLAND_PROPS_ATTR, wrapConfigWithIslands } from './islands';

const fakePuck = { renderDropZone: () => null, metadata: {}, isEditing: false, dragRef: null };

/** Minimal config with one island component and one plain component. */
function makeConfig(): Config {
    return {
        components: {
            Widget: {
                island: true,
                render: ({ title }: any) => <span data-testid="widget">{title}</span>,
            },
            Plain: {
                render: () => <span data-testid="plain">plain</span>,
            },
        },
    } as unknown as Config;
}

/** Renders a wrapped component and hands back its outermost element. */
async function renderWrapped(name: string, props: Record<string, unknown>) {
    const wrapped = wrapConfigWithIslands(makeConfig());
    const Component = (wrapped.components as any)[name].render;
    const screen = await render(<Component {...props} />);
    return screen.container.firstElementChild as HTMLElement;
}

function islandPropsOf(el: HTMLElement): Record<string, unknown> {
    return JSON.parse(el.getAttribute(ISLAND_PROPS_ATTR) ?? '{}');
}

describe('wrapConfigWithIslands', () => {
    it('leaves non-island components untouched', () => {
        const original = makeConfig();
        const wrapped = wrapConfigWithIslands(original);

        expect((wrapped.components as any).Plain).toBe((original.components as any).Plain);
    });

    it('preserves the rest of the config object', () => {
        const original = { ...makeConfig(), root: { render: () => null } } as unknown as Config;
        const wrapped = wrapConfigWithIslands(original);

        expect(wrapped.root).toBe(original.root);
    });

    it('tolerates a config with no components at all', () => {
        expect(() => wrapConfigWithIslands({} as Config)).not.toThrow();
    });

    it('wraps an island in a marker carrying the component name', async () => {
        const el = await renderWrapped('Widget', { title: 'hi', puck: fakePuck });

        expect(el.getAttribute(ISLAND_NAME_ATTR)).toBe('Widget');
    });

    it('still renders the underlying component inside the marker', async () => {
        const el = await renderWrapped('Widget', { title: 'hello', puck: fakePuck });

        expect(el.querySelector('[data-testid="widget"]')?.textContent).toBe('hello');
    });

    it('uses display:contents so the marker never affects layout', async () => {
        const el = await renderWrapped('Widget', { title: 'hi', puck: fakePuck });

        expect(el.style.display).toBe('contents');
    });

    it('emits no marker while editing, so the editor preview is not double-mounted', async () => {
        const el = await renderWrapped('Widget', { title: 'hi', puck: { ...fakePuck, isEditing: true } });

        expect(el.hasAttribute(ISLAND_NAME_ATTR)).toBe(false);
        expect(el.getAttribute('data-testid')).toBe('widget');
    });

    it('serializes plain props into the hydration payload', async () => {
        const el = await renderWrapped('Widget', {
            title: 'hi',
            count: 3,
            flag: false,
            nested: { a: [1, 2] },
            puck: fakePuck,
        });

        expect(islandPropsOf(el)).toEqual({ title: 'hi', count: 3, flag: false, nested: { a: [1, 2] } });
    });

    it('strips puck/editMode/dragRef, which are non-serializable or client-meaningless', async () => {
        const el = await renderWrapped('Widget', {
            title: 'hi',
            puck: fakePuck,
            editMode: true,
            dragRef: () => undefined,
        });

        const payload = islandPropsOf(el);
        expect(payload).not.toHaveProperty('puck');
        expect(payload).not.toHaveProperty('editMode');
        expect(payload).not.toHaveProperty('dragRef');
    });

    it('drops functions rather than throwing, so one stray prop cannot break the page', async () => {
        const el = await renderWrapped('Widget', { title: 'hi', onClick: () => undefined, puck: fakePuck });

        expect(islandPropsOf(el)).toEqual({ title: 'hi' });
    });

    it('drops React elements passed as props', async () => {
        const el = await renderWrapped('Widget', { title: 'hi', slot: <span>nope</span>, puck: fakePuck });

        expect(islandPropsOf(el)).toEqual({ title: 'hi' });
    });

    it('drops symbol-valued props', async () => {
        const el = await renderWrapped('Widget', { title: 'hi', tag: Symbol('x'), puck: fakePuck });

        expect(islandPropsOf(el)).toEqual({ title: 'hi' });
    });

    it('produces a payload that survives a JSON round-trip unchanged', async () => {
        const el = await renderWrapped('Widget', { title: 'a "quoted" & <angled> value', puck: fakePuck });

        expect(islandPropsOf(el)).toEqual({ title: 'a "quoted" & <angled> value' });
    });
});
