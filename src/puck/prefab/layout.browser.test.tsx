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
    const layout = {
        desktop: { columns: 3, gap: 4 },
        tablet: { columns: 2, gap: 4 },
        mobile: { columns: 1, gap: 0 },
        tabletCustomized: true,
        mobileCustomized: true,
    };

    it('exposes each breakpoint\'s column count and gap as custom properties', async () => {
        const style = await slotStyleOf(Grid, { layout, content: slot, id: 'a' });

        expect(style.getPropertyValue('--columns-desktop')).toBe('3');
        expect(style.getPropertyValue('--gap-desktop')).toBe('1rem');
        expect(style.getPropertyValue('--columns-tablet')).toBe('2');
        expect(style.getPropertyValue('--gap-tablet')).toBe('1rem');
        expect(style.getPropertyValue('--columns-mobile')).toBe('1');
        expect(style.getPropertyValue('--gap-mobile')).toBe('0rem');
    });

    it('scopes its generated stylesheet to this instance via the component id', async () => {
        const Component = renderOf(Grid);
        const screen = await render(<Component layout={layout} content={slot} id="abc" puck={puck} />);

        expect(screen.container.querySelector('[data-testid="slot"]')?.className).toBe('Grid-abc');
        expect(screen.container.querySelector('style')?.textContent).toContain('.Grid-abc');
    });

    it('falls back to a 3-column default when no layout has been configured', async () => {
        const style = await slotStyleOf(Grid, { layout: undefined, content: slot, id: 'a' });

        expect(style.getPropertyValue('--columns-desktop')).toBe('3');
        expect(style.getPropertyValue('--gap-desktop')).toBe('1rem');
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
