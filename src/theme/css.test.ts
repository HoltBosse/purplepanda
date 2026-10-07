import { describe, expect, it } from 'vitest';
import { contrastRatio, schemeContrastIssues } from './contrast';
import { fontStack, themeFontLinks, themeToCss } from './css';
import { availableWeights, fontFromLegacyLink, weightsUsed, withRebuiltFontLinks } from './fonts';
import { normalizeTheme } from './normalize';
import { DEFAULT_THEME, GRAPE_THEME } from './presets';
import { deleteColor, deleteFont, deleteWithReplacement, fontRole, fontUsage } from './resolve';
import type { Theme } from './types';
import { countUsage } from './usage';

// Grape plus a script "Accent" font and an "Eyebrow" text style using it.
function withAccent(): Theme {
    const theme = structuredClone(GRAPE_THEME);
    theme.fonts.push({ id: 'accent', name: 'Accent', family: 'Caveat', link: 'https://fonts.bunny.net/css2?family=Caveat:wght@400&display=swap', category: 'handwriting', weights: [400, 500, 600, 700] });
    theme.textStyles.push({ id: 'eyebrow', name: 'Eyebrow', font: 'accent', size: 4, weight: 500, lineHeight: 1.2 });
    return theme;
}

// The block of declarations for an exact selector, for asserting on one rule at a time.
function rule(css: string, selector: string): string {
    const start = css.indexOf(`${selector} {`);
    if (start < 0) throw new Error(`no rule for ${selector}`);
    return css.slice(start, css.indexOf('}', start) + 1);
}

describe('themeToCss', () => {
    const css = themeToCss(GRAPE_THEME);

    it('defines prefixed color variables for light, dark-by-system and pinned dark mode', () => {
        expect(rule(css, ':root')).toContain('--pp-color-grape: #5b3fd0;');
        expect(css).toContain('@media (prefers-color-scheme: dark) {\n:root:not([data-pp-mode="light"]) {');
        expect(rule(css, ':root[data-pp-mode="dark"], [data-pp-mode="dark"]')).toContain('--pp-color-grape: #7059e3;');
        // Never daisyUI's names.
        expect(css).not.toMatch(/--border:|data-theme/);
    });

    it('builds gradients from color variables so dark mode follows', () => {
        expect(rule(css, ':root')).toContain('--pp-gradient-dusk: linear-gradient(135deg, var(--pp-color-grape-deep) 0%, var(--pp-color-grape) 100%);');
    });

    it('sets every scheme role, and bg-image explicitly so nested surfaces drop a gradient', () => {
        const dusk = rule(css, '[data-scheme="dusk"]');
        expect(dusk).toContain('--pp-scheme-bg: var(--pp-color-grape-deep);');
        expect(dusk).toContain('--pp-scheme-bg-image: var(--pp-gradient-dusk);');
        expect(rule(css, '[data-scheme="default"]')).toContain('--pp-scheme-bg-image: none;');
        const paint = rule(css, '[data-scheme]');
        expect(paint).toContain('background-image: var(--pp-scheme-bg-image);');
        // A bare or unknown scheme gets the default's colors.
        expect(paint).toContain('--pp-scheme-bg: var(--pp-color-canvas);');
    });

    it('maps deleted ids onto their replacements', () => {
        const theme = deleteWithReplacement(deleteWithReplacement(GRAPE_THEME, 'scheme', 'brand', 'inverted'), 'variant', 'accent', 'secondary');
        const out = themeToCss(theme);
        expect(out).toContain('[data-scheme="inverted"], [data-scheme="brand"] {');
        expect(out).toContain('.pp-btn--secondary, .pp-btn--accent {');
        expect(out).not.toMatch(/^\[data-scheme="brand"\] \{/m);
    });

    it('draws a border preset on the sides a component lists', () => {
        expect(rule(css, '[data-pp-border="strong"]')).toContain('--pp-border-width: 2px;');
        // A bare or unknown preset gets Subtle.
        expect(rule(css, '[data-pp-border]')).toContain('--pp-border-width: 1px;');
        expect(rule(css, '[data-pp-border="none"]')).toContain('border: none;');
        expect(rule(css, '[data-pp-sides]')).toContain('border-width: 0;');
        expect(rule(css, '[data-pp-sides~="left"]')).toContain('border-left-width: var(--pp-border-width);');
        // A card's own border comes after the theme's card rule, so it wins.
        expect(css.indexOf('[data-pp-border] {')).toBeGreaterThan(css.indexOf('.pp-card {'));
    });

    it("puts the theme's card border on the theme's card sides", () => {
        expect(rule(css, '.pp-card')).toContain('border-width: var(--pp-border-width) var(--pp-border-width) var(--pp-border-width) var(--pp-border-width);');
        const theme = structuredClone(GRAPE_THEME);
        theme.card.sides = ['top', 'bottom'];
        expect(rule(themeToCss(theme), '.pp-card')).toContain('border-width: var(--pp-border-width) 0 var(--pp-border-width) 0;');
        theme.card.border = 'none';
        expect(rule(themeToCss(theme), '.pp-card')).toContain('border: none;');
    });

    it('maps a deleted border preset onto its replacement, card setting included', () => {
        const theme = structuredClone(GRAPE_THEME);
        theme.borders.push({ id: 'thick', name: 'Thick', width: 4, color: 'scheme.fg' });
        theme.card.border = 'thick';
        const next = deleteWithReplacement(theme, 'border', 'thick', 'strong');
        expect(next.card.border).toBe('strong');
        expect(themeToCss(next)).toContain('[data-pp-border="strong"], [data-pp-border="thick"] {');
        expect(deleteWithReplacement(theme, 'border', 'subtle', 'strong').borders.some((b) => b.id === 'subtle')).toBe(true);
    });

    it('generates hover, active and focus-visible states for buttons', () => {
        expect(rule(css, '.pp-btn:hover')).toContain('color-mix(in oklab, var(--pp-btn-bg), var(--pp-btn-fg) 12%)');
        expect(rule(css, '.pp-btn:active')).toContain('20%');
        expect(rule(css, '.pp-btn:focus-visible')).toContain('outline: 2px solid var(--pp-scheme-fg);');
        expect(rule(css, '.pp-btn--accent')).toContain('--pp-btn-bg: var(--pp-color-leaf);');
        expect(rule(css, '.pp-btn--secondary')).toContain('--pp-btn-border: var(--pp-scheme-border);');
    });

    it('writes sizes in component units', () => {
        expect(rule(css, '.pp-text-h1, .pp-rich [data-text-style="h1"]')).toContain('font-size: 2.5rem;'); // 10 units
        expect(rule(css, '.pp-btn')).toContain('border-radius: 0.5rem;'); // md = 2 units
        expect(rule(css, '.pp-card')).toContain('border-radius: 0.875rem;'); // lg = 3.5 units
        expect(rule(css, '.pp-card')).toContain('--pp-border-width: 1px;');
        expect(rule(css, '.pp-card')).toContain('--pp-border-color: var(--pp-scheme-border);');
    });

    it('applies text styles to rich text and points its colors at the scheme', () => {
        expect(rule(css, '.pp-rich h2')).toContain('font-family: var(--pp-font-heading);');
        expect(rule(css, '.pp-rich p')).toContain('font-size: 1rem;');
        expect(rule(css, '.pp-rich')).toContain('--tw-prose-body: var(--pp-scheme-fg);');
    });

    it('scopes every rule to an element when asked', () => {
        const scoped = themeToCss(GRAPE_THEME, { scope: '#preview' });
        expect(scoped).toContain('#preview {\n  --pp-color-canvas');
        expect(scoped).toContain('#preview [data-scheme="brand"] {');
        expect(scoped).toContain('#preview .pp-btn:hover {');
        expect(scoped).not.toMatch(/^:root/m);
        expect(scoped).not.toMatch(/^body /m);
    });
});

describe('fonts', () => {
    it('builds a fallback stack from the Bunny category', () => {
        expect(fontStack(fontRole(GRAPE_THEME, 'heading'))).toBe('"Fraunces", ui-serif, Georgia, "Times New Roman", serif');
        expect(fontStack(fontRole(GRAPE_THEME, 'body'))).toBe('"Inter", ui-sans-serif, system-ui, sans-serif');
        expect(fontStack(fontRole(DEFAULT_THEME, 'body'))).toBe('inherit');
    });

    it('loads exactly the weights the theme uses, limited to what the family has', () => {
        const theme = structuredClone(GRAPE_THEME);
        theme.buttons.weight = 500;
        expect(weightsUsed(theme, 'heading')).toEqual([600]);
        expect(weightsUsed(theme, 'body')).toEqual([400, 500, 600, 700]);
        fontRole(theme, 'body').weights = [300, 400, 800];
        expect(availableWeights(fontRole(theme, 'body'), [400, 500, 600, 700])).toEqual([400, 800]);
        const rebuilt = withRebuiltFontLinks(theme);
        expect(new URL(fontRole(rebuilt, 'body').link).searchParams.get('family')).toBe('Inter:wght@400;800');
        expect(new URL(fontRole(rebuilt, 'heading').link).searchParams.get('family')).toBe('Fraunces:wght@600');
    });

    it('leaves links from elsewhere alone', () => {
        const theme = structuredClone(GRAPE_THEME);
        Object.assign(fontRole(theme, 'heading'), { family: 'Josefin Sans', link: 'https://use.typekit.net/x.css', category: '', weights: [] });
        expect(fontRole(withRebuiltFontLinks(theme), 'heading').link).toBe('https://use.typekit.net/x.css');
    });

    it('loads a font beyond heading and body only while a text style uses it', () => {
        const theme = withAccent();
        expect(themeFontLinks(theme).some((l) => l.includes('Caveat'))).toBe(true);
        theme.textStyles = theme.textStyles.filter((t) => t.id !== 'eyebrow');
        expect(themeFontLinks(theme).some((l) => l.includes('Caveat'))).toBe(false);
        expect(new URL(fontRole(withRebuiltFontLinks(withAccent()), 'accent').link).searchParams.get('family')).toBe('Caveat:wght@500');
    });

    it('reads the old font settings', () => {
        expect(fontFromLegacyLink('https://fonts.bunny.net/css2?family=Lora:wght@400;700&display=swap')).toEqual({
            family: 'Lora',
            link: 'https://fonts.bunny.net/css2?family=Lora:wght@400;700&display=swap',
            category: '',
            weights: [400, 700],
        });
        expect(fontFromLegacyLink('')).toBeUndefined();
    });
});

describe('custom fonts and text styles', () => {
    it('defines a variable per font and points text styles at theirs', () => {
        const css = themeToCss(withAccent());
        expect(rule(css, ':root')).toContain('--pp-font-accent: "Caveat", cursive;');
        expect(rule(css, ':root')).toContain('--pp-heading-font: var(--pp-font-heading);');
        expect(rule(css, '.pp-text-eyebrow, .pp-rich [data-text-style="eyebrow"]')).toContain('font-family: var(--pp-font-accent);');
        expect(rule(css, '.pp-text-h1, .pp-rich [data-text-style="h1"]')).toContain('font-family: var(--pp-font-heading);');
    });

    it('styles a deleted text style as its replacement', () => {
        const css = themeToCss(deleteWithReplacement(withAccent(), 'textStyle', 'eyebrow', 'small'));
        expect(css).toContain('.pp-text-small, .pp-rich [data-text-style="small"], .pp-text-eyebrow, .pp-rich [data-text-style="eyebrow"] {');
    });

    it('rewrites text styles when their font is deleted, and never deletes a built-in font', () => {
        const theme = deleteFont(withAccent(), 'accent', 'heading');
        expect(theme.fonts.map((f) => f.id)).toEqual(['heading', 'body']);
        expect(theme.textStyles.find((t) => t.id === 'eyebrow')?.font).toBe('heading');
        expect(fontUsage(withAccent(), 'accent')).toBe(1);
        expect(deleteFont(GRAPE_THEME, 'body', 'heading').fonts).toHaveLength(2);
    });
});

describe('contrast', () => {
    it('computes WCAG ratios', () => {
        expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
        expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
    });

    it('passes the shipped presets', () => {
        for (const theme of [DEFAULT_THEME, GRAPE_THEME]) {
            for (const scheme of theme.schemes) expect(schemeContrastIssues(theme, scheme, 'light')).toEqual([]);
        }
    });

    it('checks muted text, transparent variants against the section and every gradient stop', () => {
        const theme = structuredClone(GRAPE_THEME);
        const brand = theme.schemes.find((s) => s.id === 'brand')!;
        theme.colors.push({ id: 'pale', name: 'Pale', light: '#8f7fe0', dark: '#8f7fe0' });
        brand.roles.muted = 'pale';
        theme.buttons.variants[1]!.fg = 'color.pale';
        const labels = schemeContrastIssues(theme, brand, 'light').map((i) => i.label);
        expect(labels).toContain('muted text');
        expect(labels).toContain('secondary button');

        const dusk = theme.schemes.find((s) => s.id === 'dusk')!;
        theme.gradients[0]!.stops.push({ color: 'grape-tint', at: 100 });
        expect(schemeContrastIssues(theme, dusk, 'light').map((i) => i.label)).toContain('text at a gradient stop');
    });
});

describe('editing helpers', () => {
    it('rewrites a deleted color everywhere inside the theme', () => {
        const theme = deleteColor(GRAPE_THEME, 'grape', 'leaf');
        expect(theme.colors.some((c) => c.id === 'grape')).toBe(false);
        expect(theme.schemes.find((s) => s.id === 'brand')!.roles.bg).toBe('leaf');
        expect(theme.gradients[0]!.stops[1]!.color).toBe('leaf');
        expect(normalizeTheme(theme, GRAPE_THEME)).toEqual(theme);
    });

    it('never deletes built-ins and repoints existing tombstones', () => {
        expect(deleteWithReplacement(GRAPE_THEME, 'scheme', 'default', 'brand').schemes[0]!.id).toBe('default');
        const once = deleteWithReplacement(GRAPE_THEME, 'scheme', 'muted', 'brand');
        const twice = deleteWithReplacement(once, 'scheme', 'brand', 'inverted');
        expect(twice.replaced).toEqual({ 'scheme:muted': 'inverted', 'scheme:brand': 'inverted' });
    });
});

describe('countUsage', () => {
    it('counts text styles set on rich text paragraphs', () => {
        const page = { content: [{ type: 'Rich', props: { id: 'r', content: '<p data-text-style="eyebrow">Hi</p><p data-text-style="eyebrow">x</p><h2 data-text-style="quote">y</h2>' } }] };
        expect(countUsage([page]).textStyle).toEqual({ eyebrow: 1, quote: 1 });
    });

    it('counts each document once per id, through slots and zones', () => {
        const page = {
            root: { props: {} },
            content: [
                { type: 'Section', props: { id: 's1', scheme: 'brand', content: [{ type: 'Button', props: { id: 'b1', variant: 'accent' } }, { type: 'Button', props: { id: 'b2', variant: 'accent' } }] } },
            ],
            zones: { 'x:y': [{ type: 'Card', props: { id: 'h', textStyle: 'h2' } }] },
        };
        const other = { content: [{ type: 'Card', props: { id: 'c', scheme: 'brand' } }, { type: 'Card', props: { id: 'd', scheme: '' } }] };
        expect(countUsage([page, other, null])).toEqual({ scheme: { brand: 2 }, variant: { accent: 1 }, textStyle: { h2: 1 }, border: {} });
    });

    it('counts border presets, but not "none"', () => {
        const page = { content: [{ type: 'Section', props: { id: 's', border: 'strong', content: [{ type: 'Card', props: { id: 'c', border: 'none' } }] } }] };
        const other = { content: [{ type: 'Card', props: { id: 'd', border: 'strong' } }, { type: 'Card', props: { id: 'e', border: '' } }] };
        expect(countUsage([page, other]).border).toEqual({ strong: 2 });
    });
});
