import type { Editor } from '@tiptap/react';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import Rich, { RichTextMenuScrollFade } from './Rich';

const puck = (isEditing: boolean) => ({
    renderDropZone: () => null,
    metadata: {},
    isEditing,
    dragRef: null,
});

const RichRender = Rich.render as (props: Record<string, unknown>) => React.JSX.Element;

const contentField = Rich.fields?.content as {
    type: string;
    options: { heading: { levels: number[] }; link: { openOnClick: boolean } };
    tiptap: { selector: (ctx: { editor?: Partial<Editor> }) => Record<string, boolean> };
};

/** Stands in for a TipTap editor, reporting the given marks as active. */
function fakeEditor(active: string[]) {
    return { isActive: (name: string) => active.includes(name) } as unknown as Editor;
}

describe('Rich render', () => {
    it('renders its content inside a prose wrapper', async () => {
        const screen = await render(<RichRender content={<p>Hello world</p>} puck={puck(false)} />);

        await expect.element(screen.getByText('Hello world')).toBeInTheDocument();
        expect(screen.container.querySelector('.prose')).not.toBeNull();
    });

    it('lets content span the full width rather than prose\'s default measure', async () => {
        const screen = await render(<RichRender content="text" puck={puck(false)} />);

        expect(screen.container.firstElementChild?.className).toContain('max-w-none');
    });

    it('adds the placeholder wrapper class only while editing', async () => {
        const editing = await render(<RichRender content="" puck={puck(true)} />);
        const published = await render(<RichRender content="" puck={puck(false)} />);

        expect(editing.container.firstElementChild?.className).toContain('rich-placeholder-wrap');
        expect(published.container.firstElementChild?.className).not.toContain('rich-placeholder-wrap');
    });

    it('renders without a puck context at all', async () => {
        const screen = await render(<RichRender content="plain" />);

        await expect.element(screen.getByText('plain')).toBeInTheDocument();
    });
});

describe('Rich field configuration', () => {
    it('offers headings only down to level 4', () => {
        expect(contentField.options.heading.levels).toEqual([1, 2, 3, 4]);
    });

    it('does not follow links inside the editor, so they stay editable', () => {
        expect(contentField.options.link.openOnClick).toBe(false);
    });

    it('can be bound to text-like content type fields', () => {
        expect(Rich.bindableFields?.content?.fieldTypes).toEqual(['text', 'textarea', 'richtext']);
    });
});

describe('Rich tiptap selector', () => {
    it('reports which marks are active at the cursor', () => {
        const state = contentField.tiptap.selector({ editor: fakeEditor(['superscript', 'link']) });

        expect(state).toEqual({ isSuperscript: true, isSubscript: false, isLink: true });
    });

    it('reports nothing active when no marks apply', () => {
        const state = contentField.tiptap.selector({ editor: fakeEditor([]) });

        expect(state).toEqual({ isSuperscript: false, isSubscript: false, isLink: false });
    });

    it('coerces to booleans when there is no editor yet', () => {
        const state = contentField.tiptap.selector({});

        expect(state).toEqual({ isSuperscript: false, isSubscript: false, isLink: false });
    });
});

// Scroll fades are driven by real measurements (scrollLeft / clientWidth / scrollWidth) and a
// ResizeObserver, so they only mean anything in a browser with actual layout.
describe('RichTextMenuScrollFade', () => {
    const fades = (root: HTMLElement) => root.querySelectorAll('.pointer-events-none');

    it('shows no fades when the menu fits without scrolling', async () => {
        const screen = await render(
            <RichTextMenuScrollFade>
                <div data-puck-rte-menu style={{ width: '200px', overflowX: 'auto' }}>
                    <div style={{ width: '100px' }}>short</div>
                </div>
            </RichTextMenuScrollFade>,
        );

        expect(fades(screen.container)).toHaveLength(0);
    });

    it('shows a right fade when the menu overflows', async () => {
        const screen = await render(
            <RichTextMenuScrollFade>
                <div data-puck-rte-menu style={{ width: '100px', overflowX: 'auto' }}>
                    <div style={{ width: '900px' }}>very wide menu</div>
                </div>
            </RichTextMenuScrollFade>,
        );

        await expect.element(screen.getByText('very wide menu')).toBeInTheDocument();
        expect(fades(screen.container).length).toBeGreaterThan(0);
    });

    it('shows a left fade once scrolled away from the start', async () => {
        const screen = await render(
            <RichTextMenuScrollFade>
                <div data-puck-rte-menu style={{ width: '100px', overflowX: 'auto' }}>
                    <div style={{ width: '900px' }}>very wide menu</div>
                </div>
            </RichTextMenuScrollFade>,
        );

        const scroller = screen.container.querySelector<HTMLElement>('[data-puck-rte-menu]');
        if (!scroller) throw new Error('scroll container not found');

        scroller.scrollLeft = 400;
        scroller.dispatchEvent(new Event('scroll'));

        await expect.poll(() => screen.container.querySelectorAll('.left-0').length).toBe(1);
    });

    it('renders its children regardless of scroll state', async () => {
        const screen = await render(
            <RichTextMenuScrollFade>
                <div data-puck-rte-menu>menu contents</div>
            </RichTextMenuScrollFade>,
        );

        await expect.element(screen.getByText('menu contents')).toBeInTheDocument();
    });

    it('does not blow up when there is no menu element to observe', async () => {
        const screen = await render(
            <RichTextMenuScrollFade>
                <div>no menu marker here</div>
            </RichTextMenuScrollFade>,
        );

        await expect.element(screen.getByText('no menu marker here')).toBeInTheDocument();
        expect(fades(screen.container)).toHaveLength(0);
    });
});
