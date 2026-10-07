// Section, Card and Button take every color from the site theme's generated CSS rather than from
// their own props. These render them through Puck with that CSS on the page and check the colors
// the browser actually computes, which is the only place scheme inheritance, gradients-only-on-
// the-scheme-element and tombstoned ids can really be seen to work.
import { type Config, type Data, Render } from '@puckeditor/core';
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import { themeToCss } from '../../theme/css';
import { GRAPE_THEME } from '../../theme/presets';
import { deleteWithReplacement } from '../../theme/resolve';
import type { Theme } from '../../theme/types';
import Button from './Button';
import Card from './Card';
import Section from './Section';

const config = { components: { Section, Card, Button } } as unknown as Config;

function button(id: string, variant?: string) {
    return { type: 'Button', props: { id, children: id, href: '', ...(variant ? { variant } : {}) } };
}

const data = {
    root: { props: {} },
    content: [
        {
            type: 'Section',
            props: {
                id: 'dusk',
                scheme: 'dusk',
                paddingY: 4,
                paddingX: 4,
                content: [
                    { type: 'Card', props: { id: 'inherit-card', scheme: '', content: [button('in-card')] } },
                    { type: 'Card', props: { id: 'brand-card', scheme: 'brand', content: [button('accent', 'accent')] } },
                ],
            },
        },
        { type: 'Section', props: { id: 'tombstoned', scheme: 'muted', paddingY: 4, paddingX: 4, content: [button('old-variant', 'shiny')] } },
        { type: 'Section', props: { id: 'unknown', scheme: 'never-existed', paddingY: 4, paddingX: 4, content: [] } },
        {
            type: 'Section',
            props: {
                id: 'bordered',
                scheme: 'default',
                border: 'strong',
                borderSides: ['top', 'bottom'],
                paddingY: 4,
                paddingX: 4,
                content: [
                    { type: 'Card', props: { id: 'no-border', scheme: '', border: 'none', borderSides: ['top'], content: [] } },
                    { type: 'Card', props: { id: 'left-border', scheme: '', border: 'subtle', borderSides: ['left'], content: [] } },
                    { type: 'Card', props: { id: 'theme-border', scheme: '', border: '', borderSides: ['left'], content: [] } },
                ],
            },
        },
    ],
} as unknown as Data;

let style: HTMLStyleElement | undefined;

async function renderThemed(theme: Theme) {
    style = document.createElement('style');
    style.textContent = themeToCss(theme);
    document.head.appendChild(style);
    const screen = await render(<Render config={config} data={data} />);
    const sections = ['dusk', 'tombstoned', 'unknown', 'bordered'];
    return {
        section: (id: string) => screen.container.querySelectorAll<HTMLElement>('section')[sections.indexOf(id)] as HTMLElement,
        card: (n: number) => screen.container.querySelectorAll<HTMLElement>('.pp-card')[n] as HTMLElement,
        button: (label: string) => [...screen.container.querySelectorAll<HTMLElement>('.pp-btn')].find((b) => b.textContent === label) as HTMLElement,
    };
}

const computed = (el: HTMLElement) => getComputedStyle(el);

const widths = (el: HTMLElement) => {
    const s = computed(el);
    return [s.borderTopWidth, s.borderRightWidth, s.borderBottomWidth, s.borderLeftWidth];
};

afterEach(() => {
    style?.remove();
    document.documentElement.removeAttribute('data-pp-mode');
});

describe('themed components', () => {
    it('paints a gradient only on the element carrying its scheme', async () => {
        const { section, card } = await renderThemed(GRAPE_THEME);

        expect(computed(section('dusk')).backgroundImage).toContain('linear-gradient');
        expect(computed(section('dusk')).color).toBe('rgb(255, 255, 255)');
        // A card that inherits the scheme takes its solid fallback, not the gradient.
        expect(computed(card(0)).backgroundImage).toBe('none');
        expect(computed(card(0)).backgroundColor).toBe('rgb(71, 48, 159)');
        // A card with a scheme of its own paints that one.
        expect(computed(card(1)).backgroundColor).toBe('rgb(91, 63, 208)');
    });

    it('colors buttons from their variant, against the scheme around them', async () => {
        const { button: btn } = await renderThemed(GRAPE_THEME);

        // Primary inside Dusk: white background, grape-deep text.
        expect(computed(btn('in-card')).backgroundColor).toBe('rgb(255, 255, 255)');
        expect(computed(btn('in-card')).color).toBe('rgb(71, 48, 159)');
        // Accent is always leaf, whatever the scheme.
        expect(computed(btn('accent')).backgroundColor).toBe('rgb(23, 120, 79)');
        // The theme's radius and size, in units.
        expect(computed(btn('accent')).borderTopLeftRadius).toBe('8px');
        expect(computed(btn('accent')).minHeight).toBe('40px');
    });

    it('switches every color to its dark value in dark mode', async () => {
        const { card } = await renderThemed(GRAPE_THEME);
        document.documentElement.setAttribute('data-pp-mode', 'dark');

        expect(computed(card(1)).backgroundColor).toBe('rgb(112, 89, 227)');
    });

    it('draws a border only on the sides chosen, and lets a card replace or drop the theme card border', async () => {
        const { section, card } = await renderThemed(GRAPE_THEME);

        expect(widths(section('bordered'))).toEqual(['2px', '0px', '2px', '0px']);
        // Strong is the scheme's text color.
        expect(computed(section('bordered')).borderTopColor).toBe(computed(section('bordered')).color);
        expect(widths(card(2))).toEqual(['0px', '0px', '0px', '0px']);
        expect(widths(card(3))).toEqual(['0px', '0px', '0px', '1px']);
        // No border of its own: the theme's card border, on every side; its stored sides are unused.
        expect(widths(card(4))).toEqual(['1px', '1px', '1px', '1px']);
    });

    it("puts the theme's card border on the theme's card sides", async () => {
        const theme = structuredClone(GRAPE_THEME);
        theme.card.sides = ['bottom'];
        const { card } = await renderThemed(theme);

        expect(widths(card(4))).toEqual(['0px', '0px', '1px', '0px']);
        // A card's own sides still win.
        expect(widths(card(3))).toEqual(['0px', '0px', '0px', '1px']);
    });

    it('renders deleted and unknown ids as their replacement or the default', async () => {
        const theme = deleteWithReplacement(
            deleteWithReplacement(GRAPE_THEME, 'scheme', 'muted', 'inverted'),
            'variant',
            'accent',
            'secondary',
        );
        theme.replaced['variant:shiny'] = 'ghost';
        const { section, button: btn } = await renderThemed(theme);

        // `muted` now renders as Inverted: ink background.
        expect(computed(section('tombstoned')).backgroundColor).toBe('rgb(29, 26, 39)');
        // Never in the theme at all: the default scheme.
        expect(computed(section('unknown')).backgroundColor).toBe('rgb(255, 255, 255)');
        // `accent` was deleted for Secondary, which is transparent with the scheme's border.
        expect(computed(btn('accent')).backgroundColor).toBe('rgba(0, 0, 0, 0)');
        expect(computed(btn('old-variant')).borderTopColor).toBe('rgba(0, 0, 0, 0)');
    });
});
