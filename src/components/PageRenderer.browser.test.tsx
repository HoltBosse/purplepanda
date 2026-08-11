import type { Data } from '@puckeditor/core';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import PageRenderer from './PageRenderer';

// `Block` and `Wrapper` come from the stubbed host Puck config (see vitest.virtual-modules.ts):
// Block renders a leaf tagged with its id, Wrapper renders a slot. Together they let these tests
// assert *where* page content lands relative to the template, which is what PageRenderer decides.
function block(id: string) {
    return { type: 'Block', props: { id } };
}

function wrapper(id: string, content: unknown[]) {
    return { type: 'Wrapper', props: { id, content } };
}

const templateSlot = { type: 'TemplateSlot', props: { id: 'slot-1' } };

function data(content: unknown[]): Data {
    return { root: { props: {} }, content } as unknown as Data;
}

const ids = (root: HTMLElement, selector: string, attr: string) =>
    [...root.querySelectorAll(selector)].map((el) => el.getAttribute(attr));

describe('PageRenderer without a template', () => {
    it('renders the page content directly', async () => {
        const screen = await render(<PageRenderer pageData={data([block('page-1')])} />);

        expect(ids(screen.container, '[data-block]', 'data-block')).toEqual(['page-1']);
    });

    it('renders nothing for empty page content', async () => {
        const screen = await render(<PageRenderer pageData={data([])} />);

        expect(screen.container.textContent).toBe('');
    });
});

describe('PageRenderer with a template', () => {
    it('splices page content in at the TemplateSlot position', async () => {
        const templateData = data([block('header'), templateSlot, block('footer')]);

        const screen = await render(
            <PageRenderer pageData={data([block('page-1')])} templateData={templateData} />,
        );

        expect(ids(screen.container, '[data-block]', 'data-block')).toEqual([
            'header',
            'page-1',
            'footer',
        ]);
    });

    it('replaces the slot rather than rendering alongside it', async () => {
        const templateData = data([templateSlot]);

        const screen = await render(
            <PageRenderer pageData={data([block('page-1')])} templateData={templateData} />,
        );

        expect(ids(screen.container, '[data-block]', 'data-block')).toEqual(['page-1']);
    });

    it('splices multiple page blocks in as a group, preserving their order', async () => {
        const templateData = data([block('header'), templateSlot]);

        const screen = await render(
            <PageRenderer
                pageData={data([block('page-1'), block('page-2')])}
                templateData={templateData}
            />,
        );

        expect(ids(screen.container, '[data-block]', 'data-block')).toEqual([
            'header',
            'page-1',
            'page-2',
        ]);
    });

    // The slot can be dropped inside another component's slot, which is why injection walks the
    // whole tree instead of scanning only the top-level content array.
    it('injects into a TemplateSlot nested inside another component', async () => {
        const templateData = data([wrapper('outer', [templateSlot])]);

        const screen = await render(
            <PageRenderer pageData={data([block('page-1')])} templateData={templateData} />,
        );

        const nested = screen.container.querySelector('[data-wrapper="outer"] [data-block="page-1"]');
        expect(nested).not.toBeNull();
    });

    it('injects into a slot nested two levels deep', async () => {
        const templateData = data([wrapper('outer', [wrapper('inner', [templateSlot])])]);

        const screen = await render(
            <PageRenderer pageData={data([block('page-1')])} templateData={templateData} />,
        );

        expect(
            screen.container.querySelector(
                '[data-wrapper="outer"] [data-wrapper="inner"] [data-block="page-1"]',
            ),
        ).not.toBeNull();
    });

    it('renders template then page when the template has no slot at all', async () => {
        const templateData = data([block('header')]);

        const screen = await render(
            <PageRenderer pageData={data([block('page-1')])} templateData={templateData} />,
        );

        expect(ids(screen.container, '[data-block]', 'data-block')).toEqual(['header', 'page-1']);
    });

    it('renders the template alone when page content is empty', async () => {
        const templateData = data([block('header'), templateSlot]);

        const screen = await render(<PageRenderer pageData={data([])} templateData={templateData} />);

        expect(ids(screen.container, '[data-block]', 'data-block')).toEqual(['header']);
    });

    it('leaves no visible marker where the TemplateSlot was', async () => {
        const templateData = data([templateSlot]);

        const screen = await render(<PageRenderer pageData={data([])} templateData={templateData} />);

        expect(screen.container.textContent).toBe('');
    });

    it('handles an empty template', async () => {
        const screen = await render(
            <PageRenderer pageData={data([block('page-1')])} templateData={data([])} />,
        );

        expect(ids(screen.container, '[data-block]', 'data-block')).toEqual(['page-1']);
    });
});
