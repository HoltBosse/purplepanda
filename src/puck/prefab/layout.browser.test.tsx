// Space/Grid/Flex/Margin are thin, but they all turn author-supplied numbers into CSS using the
// same `n * 0.25rem` spacing scale. These cover that arithmetic and the axis/direction mapping,
// which are easy to break silently — nothing else in the suite would notice a wrong unit.
import type { SlotComponent } from '@puckeditor/core';
import type React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import Flex from './Flex';
import Grid from './Grid';
import Margin from './Margin';
import Space from './Space';

const puck = { renderDropZone: () => null, metadata: {}, isEditing: false, dragRef: null };

/** Stands in for a Puck slot: renders a div carrying whatever props the component passes down. */
const slot: SlotComponent = (props) => <div data-testid="slot" {...props} />;

const renderOf = (config: { render: unknown }) => config.render as (p: Record<string, unknown>) => React.JSX.Element;

async function slotStyleOf(config: { render: unknown }, props: Record<string, unknown>) {
    const Component = renderOf(config);
    const screen = await render(<Component {...props} puck={puck} />);
    return (screen.container.querySelector('[data-testid="slot"]') as HTMLElement).style;
}

describe('Space', () => {
    it('converts size to the 0.25rem spacing scale', async () => {
        const Component = renderOf(Space);
        const screen = await render(<Component direction="vertical" size={4} puck={puck} />);

        expect((screen.container.firstElementChild as HTMLElement).style.height).toBe('1rem');
    });

    it('spans full width and spaces vertically when direction is vertical', async () => {
        const Component = renderOf(Space);
        const screen = await render(<Component direction="vertical" size={8} puck={puck} />);

        const style = (screen.container.firstElementChild as HTMLElement).style;
        expect(style.width).toBe('100%');
        expect(style.height).toBe('2rem');
    });

    it('spans full height and spaces horizontally when direction is horizontal', async () => {
        const Component = renderOf(Space);
        const screen = await render(<Component direction="horizontal" size={8} puck={puck} />);

        const style = (screen.container.firstElementChild as HTMLElement).style;
        expect(style.height).toBe('100%');
        expect(style.width).toBe('2rem');
    });

    it('applies the size on both axes when direction is empty ("Both")', async () => {
        const Component = renderOf(Space);
        const screen = await render(<Component direction="" size={4} puck={puck} />);

        const style = (screen.container.firstElementChild as HTMLElement).style;
        expect(style.width).toBe('1rem');
        expect(style.height).toBe('1rem');
    });

    it('collapses to zero at size 0', async () => {
        const Component = renderOf(Space);
        const screen = await render(<Component direction="" size={0} puck={puck} />);

        expect((screen.container.firstElementChild as HTMLElement).style.width).toBe('0rem');
    });
});

describe('Grid', () => {
    it('lays out the requested number of equal columns', async () => {
        const style = await slotStyleOf(Grid, { columns: 3, gap: 4, content: slot });

        expect(style.display).toBe('grid');
        expect(style.gridTemplateColumns).toBe('repeat(3, 1fr)');
    });

    it('converts gap to the 0.25rem spacing scale', async () => {
        const style = await slotStyleOf(Grid, { columns: 2, gap: 8, content: slot });

        expect(style.gap).toBe('2rem');
    });

    it('handles a single column', async () => {
        const style = await slotStyleOf(Grid, { columns: 1, gap: 0, content: slot });

        expect(style.gridTemplateColumns).toBe('repeat(1, 1fr)');
        expect(style.gap).toBe('0rem');
    });
});

describe('Flex', () => {
    it('maps direction, alignment and wrap onto flexbox', async () => {
        const style = await slotStyleOf(Flex, {
            direction: 'column',
            justifyContent: 'center',
            alignItems: 'end',
            gap: 4,
            wrap: 'nowrap',
            items: slot,
        });

        expect(style.display).toBe('flex');
        expect(style.flexDirection).toBe('column');
        expect(style.justifyContent).toBe('center');
        expect(style.alignItems).toBe('end');
        expect(style.flexWrap).toBe('nowrap');
    });

    it('converts gap to the 0.25rem spacing scale', async () => {
        const style = await slotStyleOf(Flex, {
            direction: 'row',
            justifyContent: 'start',
            alignItems: 'stretch',
            gap: 6,
            wrap: 'wrap',
            items: slot,
        });

        expect(style.gap).toBe('1.5rem');
    });
});

describe('Margin', () => {
    it('exposes mobile padding and desktop width as CSS custom properties', async () => {
        const style = await slotStyleOf(Margin, { desktopWidth: 312, mobileMargin: 4, content: slot, id: 'x' });

        expect(style.getPropertyValue('--margin-mobile')).toBe('1rem');
        expect(style.getPropertyValue('--margin-desktop-width')).toBe('78rem');
    });

    it('scopes its generated stylesheet to this instance via the component id', async () => {
        const Component = renderOf(Margin);
        const screen = await render(
            <Component desktopWidth={312} mobileMargin={4} content={slot} id="abc" puck={puck} />,
        );

        expect(screen.container.querySelector('[data-testid="slot"]')?.className).toBe('Margin-abc');
        expect(screen.container.querySelector('style')?.textContent).toContain('.Margin-abc');
    });

    it('gives two instances non-colliding class names', async () => {
        const Component = renderOf(Margin);
        const a = await render(<Component desktopWidth={1} mobileMargin={1} content={slot} id="one" puck={puck} />);
        const b = await render(<Component desktopWidth={1} mobileMargin={1} content={slot} id="two" puck={puck} />);

        expect(a.container.querySelector('[data-testid="slot"]')?.className).not.toBe(
            b.container.querySelector('[data-testid="slot"]')?.className,
        );
    });
});
