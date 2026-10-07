import { describe, expect, it } from 'vitest';
import { normalizeTheme } from './normalize';
import { DEFAULT_THEME, GRAPE_THEME } from './presets';
import { fontRole, resolveScheme, resolveSchemeId, resolveTextStyle, resolveVariantId } from './resolve';

describe('normalizeTheme', () => {
    it('reads nothing as the fallback theme', () => {
        expect(normalizeTheme(undefined)).toEqual(DEFAULT_THEME);
        expect(normalizeTheme('garbage', GRAPE_THEME)).toEqual(GRAPE_THEME);
    });

    it('leaves a valid theme unchanged', () => {
        expect(normalizeTheme(structuredClone(GRAPE_THEME))).toEqual(GRAPE_THEME);
    });

    it('fills missing fields from the fallback and drops unknown ones', () => {
        const stored = { colors: GRAPE_THEME.colors, mystery: 1, buttons: { weight: 500 } };
        const theme = normalizeTheme(stored);
        expect(theme).not.toHaveProperty('mystery');
        expect(theme.buttons.weight).toBe(500);
        expect(theme.buttons.radius).toBe(DEFAULT_THEME.buttons.radius);
        expect(theme.textStyles.map((t) => t.id)).toEqual(['display', 'h1', 'h2', 'h3', 'body', 'small']);
    });

    it('repairs references to colors that no longer exist', () => {
        const stored = structuredClone(GRAPE_THEME);
        const brand = stored.schemes.find((s) => s.id === 'brand')!;
        brand.roles.fg = 'gone';
        stored.buttons.variants[3]!.bg = 'color.gone';
        stored.gradients[0]!.stops.push({ color: 'gone', at: 50 });
        const theme = normalizeTheme(stored, GRAPE_THEME);
        const fixed = theme.schemes.find((s) => s.id === 'brand')!;
        expect(theme.colors.some((c) => c.id === fixed.roles.fg)).toBe(true);
        expect(theme.buttons.variants[3]!.bg).toBe('scheme.btnBg');
        expect(theme.gradients[0]!.stops).toHaveLength(2);
    });

    it('drops a gradient left with fewer than two stops, and the schemes pointing at it', () => {
        const stored = structuredClone(GRAPE_THEME);
        stored.gradients[0]!.stops = [{ color: 'grape', at: 0 }];
        const theme = normalizeTheme(stored, GRAPE_THEME);
        expect(theme.gradients).toEqual([]);
        expect(theme.schemes.find((s) => s.id === 'dusk')).not.toHaveProperty('gradient');
    });

    it('restores built-in items that were removed', () => {
        const stored = structuredClone(GRAPE_THEME);
        stored.schemes = stored.schemes.filter((s) => s.id !== 'default');
        stored.buttons.variants = stored.buttons.variants.filter((v) => v.id !== 'ghost');
        stored.borders = [];
        const theme = normalizeTheme(stored, GRAPE_THEME);
        expect(theme.schemes[0]).toMatchObject({ id: 'default', builtin: true });
        expect(theme.buttons.variants.map((v) => v.id)).toEqual(['primary', 'secondary', 'ghost', 'accent']);
        expect(theme.borders.map((b) => b.id)).toEqual(['subtle', 'strong']);
    });

    it('rejects invalid ids, hex values and duplicate ids', () => {
        const stored = structuredClone(DEFAULT_THEME);
        stored.colors.push({ id: 'Bad Id', name: 'x', light: '#000000', dark: '#000000' });
        stored.colors.push({ id: 'canvas', name: 'Duplicate', light: '#000000', dark: '#000000' });
        stored.colors[0]!.light = 'red';
        const theme = normalizeTheme(stored);
        expect(theme.colors.map((c) => c.id)).toEqual(DEFAULT_THEME.colors.map((c) => c.id));
        expect(theme.colors[0]!.light).toBe('#888888');
    });

    it('keeps font families from breaking out of CSS and links to https', () => {
        const theme = normalizeTheme({
            ...DEFAULT_THEME,
            fonts: {
                heading: { family: 'Evil"; } body { color: red', link: 'javascript:alert(1)', category: 'serif', weights: [400, 450] },
                body: { family: 'Inter', link: 'https://fonts.bunny.net/css2?family=Inter', category: 'sans-serif', weights: [700, 400] },
            },
        });
        expect(fontRole(theme, 'heading').family).toBe('Evil  body  color red');
        expect(fontRole(theme, 'heading').link).toBe('');
        expect(fontRole(theme, 'heading').weights).toEqual([400]);
        expect(fontRole(theme, 'body').weights).toEqual([400, 700]);
    });

    it('turns fonts saved as { heading, body } into the built-in fonts of the list', () => {
        const theme = normalizeTheme({ ...DEFAULT_THEME, fonts: { heading: { family: 'Lora', link: '', category: 'serif', weights: [400] }, body: {} } });
        expect(theme.fonts.map((f) => [f.id, f.name, f.builtin, f.family])).toEqual([
            ['heading', 'Heading', true, 'Lora'],
            ['body', 'Body', true, ''],
        ]);
    });

    it('keeps custom fonts and text styles, and repairs a text style whose font is gone', () => {
        const stored = structuredClone(GRAPE_THEME) as unknown as Record<string, unknown> & typeof GRAPE_THEME;
        stored.fonts.push({ id: 'accent', name: 'Accent', family: 'Caveat', link: '', category: 'handwriting', weights: [400] });
        stored.textStyles.push({ id: 'eyebrow', name: 'Eyebrow', font: 'accent', size: 4, weight: 400, lineHeight: 1.2 });
        stored.textStyles.push({ id: 'quote', name: 'Quote', font: 'gone', size: 6, weight: 400, lineHeight: 1.4 });
        stored.textStyles = stored.textStyles.filter((t) => t.id !== 'small');
        const theme = normalizeTheme(stored, GRAPE_THEME);
        expect(theme.fonts.map((f) => f.id)).toEqual(['heading', 'body', 'accent']);
        expect(theme.textStyles.find((t) => t.id === 'eyebrow')).toMatchObject({ font: 'accent' });
        expect(theme.textStyles.find((t) => t.id === 'eyebrow')).not.toHaveProperty('builtin');
        expect(theme.textStyles.find((t) => t.id === 'quote')?.font).toBe('body');
        // A missing built-in comes back.
        expect(theme.textStyles.find((t) => t.id === 'small')).toMatchObject({ builtin: true });
    });

    it('collapses tombstone chains and repairs broken ones', () => {
        const theme = normalizeTheme({
            ...GRAPE_THEME,
            replaced: { 'scheme:old': 'older', 'scheme:older': 'brand', 'scheme:lost': 'nowhere', 'variant:shiny': 'accent', 'scheme:brand': 'muted' },
        });
        expect(theme.replaced).toEqual({ 'scheme:old': 'brand', 'scheme:older': 'brand', 'scheme:lost': 'default', 'variant:shiny': 'accent' });
    });
});

describe('border sides', () => {
    it('keeps sides in order without repeats, and drops unknown ones', () => {
        const theme = normalizeTheme({ ...GRAPE_THEME, card: { ...GRAPE_THEME.card, sides: ['left', 'top', 'diagonal', 'top'] } });
        expect(theme.card.sides).toEqual(['top', 'left']);
        // No sides at all is a choice; no list is not.
        expect(normalizeTheme({ ...GRAPE_THEME, card: { ...GRAPE_THEME.card, sides: [] } }).card.sides).toEqual([]);
        expect(normalizeTheme({ ...GRAPE_THEME, card: { border: 'subtle' } }).card.sides).toEqual(['top', 'right', 'bottom', 'left']);
    });

    it('never names a preset "none", and keeps border tombstones', () => {
        const theme = normalizeTheme({
            ...GRAPE_THEME,
            borders: [...GRAPE_THEME.borders, { id: 'none', name: 'None', width: 2, color: 'scheme.fg' }],
            replaced: { 'border:thick': 'strong', 'border:lost': 'gone' },
        });
        expect(theme.borders.some((b) => b.id === 'none')).toBe(false);
        expect(theme.replaced).toEqual({ 'border:thick': 'strong', 'border:lost': 'subtle' });
    });
});

describe('resolution', () => {
    const theme = normalizeTheme({ ...GRAPE_THEME, replaced: { 'scheme:sunny': 'brand', 'variant:buy': 'accent' } });

    it('follows tombstones to the replacement', () => {
        expect(resolveSchemeId(theme, 'sunny')).toBe('brand');
        expect(resolveVariantId(theme, 'buy')).toBe('accent');
    });

    it('falls back to the built-in default for anything unknown', () => {
        expect(resolveSchemeId(theme, 'never-existed')).toBe('default');
        expect(resolveSchemeId(theme, undefined)).toBe('default');
        expect(resolveVariantId(theme, '')).toBe('primary');
        expect(resolveScheme(theme, 'nope').id).toBe('default');
        expect(resolveTextStyle(theme, 'h9').id).toBe('body');
        const withTombstone = normalizeTheme({ ...GRAPE_THEME, replaced: { 'textStyle:eyebrow': 'small', 'textStyle:lost': 'gone' } });
        expect(resolveTextStyle(withTombstone, 'eyebrow').id).toBe('small');
        expect(withTombstone.replaced['textStyle:lost']).toBe('body');
    });
});
