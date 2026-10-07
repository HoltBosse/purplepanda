import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { normalizeTheme } from '../../theme/normalize';
import { DEFAULT_THEME, GRAPE_THEME } from '../../theme/presets';
import { emptyUsage, type ThemeUsage } from '../../theme/usage';
import ThemeSettings, { applyPreset } from './ThemeSettings';

const usage: ThemeUsage = { scheme: { brand: 3, default: 10 }, variant: { accent: 2 }, textStyle: {}, border: {} };

// Form posts are how the screen saves; capture them instead of navigating the test page away.
let posted: { action: string; fields: Record<string, string> }[] = [];

beforeEach(() => {
    posted = [];
    vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(function (this: HTMLFormElement) {
        posted.push({ action: this.getAttribute('action') ?? '', fields: Object.fromEntries(new FormData(this) as unknown as Iterable<[string, string]>) });
    });
    vi.spyOn(window, 'fetch').mockResolvedValue(new Response(JSON.stringify(usage), { headers: { 'content-type': 'application/json' } }));
});

afterEach(() => {
    vi.restoreAllMocks();
});

async function renderScreen(props: Partial<React.ComponentProps<typeof ThemeSettings>> = {}) {
    const screen = await render(<ThemeSettings saved={GRAPE_THEME} usage={usage} fontPresets={[]} {...props} />);
    const q = <T extends Element = HTMLElement>(selector: string) => screen.container.querySelector<T>(selector);
    const buttonByText = (text: string) =>
        [...screen.container.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text) as HTMLButtonElement;
    const status = () => q('[data-theme-status]')?.textContent;
    return { screen, q, buttonByText, status };
}

describe('ThemeSettings', () => {
    it('opens on the saved theme with nothing to save', async () => {
        const { status, buttonByText, q } = await renderScreen();

        expect(status()).toBe('Saved');
        expect(buttonByText('Save').disabled).toBe(true);
        expect(q('[data-color="grape"]')).not.toBeNull();
    });

    it('marks edits as unsaved, and discards them locally', async () => {
        const { q, status, buttonByText } = await renderScreen();
        const name = q<HTMLInputElement>('[data-color="grape"] input[aria-label="Color name"]')!;

        name.focus();
        document.execCommand('insertText', false, ' purple');
        await expect.poll(status).toBe('Unsaved changes');
        expect(buttonByText('Save').disabled).toBe(false);

        buttonByText('Discard changes').click();
        await expect.poll(status).toBe('Saved');
        expect(posted).toEqual([]);
    });

    it('adds a color with an id made from the name it was given', async () => {
        const { q, buttonByText } = await renderScreen();

        buttonByText('Add color').click();
        await expect.poll(() => q('input[aria-label="Add color: name"]')).not.toBeNull();
        q<HTMLInputElement>('input[aria-label="Add color: name"]')!.focus();
        document.execCommand('insertText', false, 'Sea glass');
        buttonByText('Add').click();

        await expect.poll(() => q('[data-color="sea-glass"]')).not.toBeNull();
    });

    it('saves through a form post carrying the theme', async () => {
        const { q, buttonByText } = await renderScreen();
        const light = q<HTMLInputElement>('[data-color="leaf"] input[aria-label="Leaf light hex"]')!;
        light.focus();
        light.select();
        document.execCommand('insertText', false, '#118844');

        await expect.poll(() => buttonByText('Save').disabled).toBe(false);
        buttonByText('Save').click();
        expect(posted[0]?.action).toBe('/admin/settings/themes/save');
        expect(Object.keys(posted[0]!.fields)).toEqual(['theme']);
        expect(JSON.parse(posted[0]!.fields.theme!).colors.find((c: { id: string }) => c.id === 'leaf').light).toBe('#118844');
    });

    it('deletes a used scheme by tombstoning it onto the chosen replacement', async () => {
        const { q, buttonByText, screen } = await renderScreen();
        buttonByText('Schemes').click();
        await expect.poll(() => q('[data-scheme-card="brand"]')).not.toBeNull();
        expect(q('[data-scheme-card="brand"]')?.textContent).toContain('Used in 3 documents');
        // Built-ins can't be deleted.
        expect(q('[data-scheme-card="default"] button[aria-label="Delete Default"]')).toBeNull();

        q<HTMLButtonElement>('button[aria-label="Delete Brand"]')!.click();
        await expect.poll(() => q<HTMLDialogElement>('dialog.modal[open]')?.textContent ?? '').toContain('3 documents use Brand');
        const select = q<HTMLSelectElement>('#theme-delete-replacement')!;
        select.value = 'inverted';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        buttonByText('Delete and replace').click();

        await expect.poll(() => q('[data-scheme-card="brand"]')).toBeNull();
        expect(q('[data-scheme-card="inverted"]')?.textContent).toContain('Used in 3 documents');
        buttonByText('Save').click();
        expect(JSON.parse(posted[0]!.fields.theme!).replaced).toEqual({ 'scheme:brand': 'inverted' });
        expect(screen.container.textContent).toContain('Scheme deleted.');
    });

    it('flags low contrast, including muted text', async () => {
        const theme = structuredClone(GRAPE_THEME);
        theme.schemes.find((s) => s.id === 'brand')!.roles.muted = 'grape';
        const { q, buttonByText } = await renderScreen({ saved: theme });
        buttonByText('Schemes').click();

        await expect.poll(() => q('[data-scheme-card="brand"] [data-contrast="light"]')?.textContent ?? '').toContain('muted text');
        expect(q('[data-scheme-card="default"] [data-contrast="light"]')?.getAttribute('data-contrast-ok')).toBe('true');
    });

    it('switches the preview between light and dark, with no CSS view', async () => {
        const { q, buttonByText } = await renderScreen();

        expect(q('#pp-theme-preview')?.getAttribute('data-pp-mode')).toBe('light');
        buttonByText('Dark').click();
        await expect.poll(() => q('#pp-theme-preview')?.getAttribute('data-pp-mode')).toBe('dark');
        expect(buttonByText('CSS')).toBeUndefined();
    });

    it('counts where each color is used inside the theme', async () => {
        const { q } = await renderScreen({ saved: DEFAULT_THEME, usage: emptyUsage() });
        expect(q('[data-color="primary"]')?.textContent).toContain('2 uses');
    });
});

describe('ThemeSettings typography', () => {
    async function typeInto(q: (s: string) => HTMLInputElement | null, selector: string, text: string) {
        await expect.poll(() => q(selector)).not.toBeNull();
        q(selector)!.focus();
        document.execCommand('insertText', false, text);
    }

    it('adds a font and a text style that uses it', async () => {
        const { q, buttonByText } = await renderScreen();
        buttonByText('Typography').click();

        await expect.poll(() => buttonByText('Add font')).toBeDefined();
        buttonByText('Add font').click();
        await typeInto(q as never, 'input[aria-label="Add font: name"]', 'Accent');
        buttonByText('Add').click();
        await expect.poll(() => q('[data-font-role="accent"]')).not.toBeNull();
        expect(q('[data-font-role="accent"]')?.textContent).toContain('not loaded on pages');
        // Built-in fonts can't be deleted; added ones can.
        expect(q('[data-font-role="heading"] button[aria-label="Delete Heading"]')).toBeNull();
        expect(q('[data-font-role="accent"] button[aria-label="Delete Accent"]')).not.toBeNull();

        buttonByText('Add text style').click();
        await typeInto(q as never, 'input[aria-label="Add text style: name"]', 'Pull quote');
        buttonByText('Add').click();
        await expect.poll(() => q('[data-text-style="pull-quote"]')).not.toBeNull();
        const font = q<HTMLSelectElement>('[data-text-style="pull-quote"] select[aria-label="Pull quote font"]')!;
        expect([...font.options].map((o) => o.value)).toEqual(['heading', 'body', 'accent']);
        font.value = 'accent';
        font.dispatchEvent(new Event('change', { bubbles: true }));
        await expect.poll(() => q('[data-font-role="accent"]')?.textContent).toContain('Used by 1 text style');

        buttonByText('Save').click();
        const saved = JSON.parse(posted[0]!.fields.theme!);
        expect(saved.fonts.map((f: { id: string }) => f.id)).toEqual(['heading', 'body', 'accent']);
        expect(saved.textStyles.find((t: { id: string }) => t.id === 'pull-quote')).toMatchObject({ name: 'Pull quote', font: 'accent' });
    });

    it('warns once there are more than a few fonts', async () => {
        const theme = structuredClone(GRAPE_THEME);
        for (const id of ['a', 'b', 'c']) theme.fonts.push({ id, name: id, family: '', link: '', category: '', weights: [] });
        const { q, buttonByText } = await renderScreen({ saved: theme });
        buttonByText('Typography').click();

        await expect.poll(() => q('[data-font-limit-warning]')).not.toBeNull();
    });

    it('deletes a used text style by tombstoning it onto the chosen replacement', async () => {
        const theme = structuredClone(GRAPE_THEME);
        theme.textStyles.push({ id: 'eyebrow', name: 'Eyebrow', font: 'body', size: 3, weight: 600, lineHeight: 1.2 });
        const withUsage: ThemeUsage = { ...usage, textStyle: { eyebrow: 4 } };
        vi.mocked(window.fetch).mockResolvedValue(new Response(JSON.stringify(withUsage)));
        const { q, buttonByText } = await renderScreen({ saved: theme, usage: withUsage });
        buttonByText('Typography').click();

        await expect.poll(() => q('[data-text-style="eyebrow"]')?.textContent).toContain('Used in 4 documents');
        expect(q('[data-text-style="h1"] button[aria-label="Delete Heading 1"]')).toBeNull();
        q<HTMLButtonElement>('button[aria-label="Delete Eyebrow"]')!.click();
        await expect.poll(() => q<HTMLDialogElement>('dialog.modal[open]')?.textContent ?? '').toContain('4 documents use Eyebrow');
        const select = q<HTMLSelectElement>('#theme-delete-replacement')!;
        select.value = 'small';
        select.dispatchEvent(new Event('change', { bubbles: true }));
        buttonByText('Delete and replace').click();

        await expect.poll(() => q('[data-text-style="eyebrow"]')).toBeNull();
        buttonByText('Save').click();
        expect(JSON.parse(posted[0]!.fields.theme!).replaced).toEqual({ 'textStyle:eyebrow': 'small' });
    });
});

describe('border presets', () => {
    it('deletes a used preset by tombstoning it, and sets the card sides', async () => {
        const theme = structuredClone(GRAPE_THEME);
        theme.borders.push({ id: 'thick', name: 'Thick', width: 4, color: 'scheme.fg' });
        const withUsage: ThemeUsage = { ...usage, border: { thick: 2 } };
        vi.mocked(window.fetch).mockResolvedValue(new Response(JSON.stringify(withUsage)));
        const { q, buttonByText } = await renderScreen({ saved: theme, usage: withUsage });
        buttonByText('Borders and cards').click();

        await expect.poll(() => q('[data-border="thick"]')?.textContent).toContain('Used in 2 documents');
        // All, stepped on to Top & bottom.
        q<HTMLButtonElement>('[data-card-sides] [data-sides-preview]')!.click();
        q<HTMLButtonElement>('button[aria-label="Delete Thick"]')!.click();
        await expect.poll(() => q<HTMLDialogElement>('dialog.modal[open]')?.textContent ?? '').toContain('2 documents use Thick');
        buttonByText('Delete and replace').click();

        await expect.poll(() => q('[data-border="thick"]')).toBeNull();
        buttonByText('Save').click();
        const saved = JSON.parse(posted[0]!.fields.theme!);
        expect(saved.replaced).toEqual({ 'border:thick': 'subtle' });
        expect(saved.card.sides).toEqual(['top', 'bottom']);
    });
});

describe('applyPreset', () => {
    it('keeps content using ids the preset lacks working', () => {
        const next = applyPreset(GRAPE_THEME, DEFAULT_THEME);
        expect(next.replaced).toEqual({ 'scheme:brand': 'default', 'scheme:dusk': 'default', 'variant:accent': 'primary' });
        expect(normalizeTheme(next)).toEqual(next);
    });
});
