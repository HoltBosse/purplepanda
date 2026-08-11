import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import { buildGridLayout, type ResponsiveLayout } from './card-grid';

const layout: ResponsiveLayout = {
    desktop: { columns: 4, gap: 8 },
    tablet: { columns: 2, gap: 4 },
    mobile: { columns: 1, gap: 2 },
    tabletCustomized: true,
    mobileCustomized: true,
};

/** The custom properties are only observable once the style object is attached to an element. */
async function styleOf(id: string, value: ResponsiveLayout | undefined) {
    const { style } = buildGridLayout(id, value);
    const screen = await render(<div data-testid="grid" style={style} />);
    return (screen.container.querySelector('[data-testid="grid"]') as HTMLElement).style;
}

describe('buildGridLayout', () => {
    it('scopes the class to the component instance', () => {
        expect(buildGridLayout('abc', layout).className).toBe('CardCollection-abc');
    });

    it('gives two instances non-colliding class names', () => {
        expect(buildGridLayout('one', layout).className).not.toBe(buildGridLayout('two', layout).className);
    });

    it('exposes each breakpoint\'s column count as a custom property', async () => {
        const style = await styleOf('a', layout);

        expect(style.getPropertyValue('--columns-desktop')).toBe('4');
        expect(style.getPropertyValue('--columns-tablet')).toBe('2');
        expect(style.getPropertyValue('--columns-mobile')).toBe('1');
    });

    it('converts each breakpoint\'s gap to the 0.25rem spacing scale', async () => {
        const style = await styleOf('a', layout);

        expect(style.getPropertyValue('--gap-desktop')).toBe('2rem');
        expect(style.getPropertyValue('--gap-tablet')).toBe('1rem');
        expect(style.getPropertyValue('--gap-mobile')).toBe('0.5rem');
    });

    it('falls back to a 3-column default when no layout has been configured', async () => {
        const style = await styleOf('a', undefined);

        expect(style.getPropertyValue('--columns-desktop')).toBe('3');
        expect(style.getPropertyValue('--gap-desktop')).toBe('1rem');
    });

    it('emits a stylesheet scoped to that same class', async () => {
        const { styleTag, className } = buildGridLayout('abc', layout);
        const screen = await render(styleTag);

        const css = screen.container.querySelector('style')?.textContent ?? '';
        expect(css).toContain(`.${className}`);
        expect(css).toContain('display: grid');
    });

    it('drives every breakpoint from custom properties rather than hard-coded values', async () => {
        const { styleTag } = buildGridLayout('abc', layout);
        const screen = await render(styleTag);

        const css = screen.container.querySelector('style')?.textContent ?? '';
        for (const prop of ['--columns-desktop', '--columns-tablet', '--columns-mobile']) {
            expect(css).toContain(`repeat(var(${prop}), 1fr)`);
        }
    });

    it('orders media queries so mobile overrides tablet', async () => {
        const { styleTag } = buildGridLayout('abc', layout);
        const screen = await render(styleTag);

        const css = screen.container.querySelector('style')?.textContent ?? '';
        expect(css.indexOf('max-width: 769px')).toBeLessThan(css.indexOf('max-width: 361px'));
    });
});
