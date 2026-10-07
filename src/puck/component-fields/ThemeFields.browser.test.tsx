import type { CustomField } from '@puckeditor/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { GRAPE_THEME } from '../../theme/presets';
import { deleteWithReplacement } from '../../theme/resolve';
import { setInjectedTheme, themeSummary } from '../../theme/summary';
import type { BorderSide } from '../../theme/types';
import { borderAttrs, borderField, borderSidesField, schemeField, textStyleField, themeStyleFields, variantField } from './ThemeFields';

function renderField<T>(field: CustomField<T>, value: T) {
    const onChange = vi.fn();
    const Field = () => <>{field.render({ field, name: 'x', id: 'x', value, onChange, readOnly: false } as never)}</>;
    return { onChange, screen: render(<Field />) };
}

afterEach(() => {
    delete (globalThis as { __PP_THEME?: unknown }).__PP_THEME;
});

describe('theme fields', () => {
    it('offers each scheme from the injected theme, with a swatch, and stores its id', async () => {
        setInjectedTheme(themeSummary(GRAPE_THEME));
        const { onChange, screen } = renderField(schemeField(), 'default');
        const { container } = await screen;

        const brand = container.querySelector<HTMLButtonElement>('button[aria-label="Brand"]')!;
        expect(container.querySelector('button[aria-label="Default"]')?.getAttribute('aria-pressed')).toBe('true');
        expect(getComputedStyle(brand.firstElementChild as HTMLElement).backgroundColor).toBe('rgb(91, 63, 208)');
        brand.click();
        expect(onChange).toHaveBeenCalledWith('brand');
    });

    it('lets a card inherit the scheme around it', async () => {
        const { onChange, screen } = renderField(schemeField({ allowInherit: true }), '');
        const { container } = await screen;

        expect(container.querySelector('button[aria-label="Inherit"]')?.getAttribute('aria-pressed')).toBe('true');
        container.querySelector<HTMLButtonElement>('button[aria-label="Default"]')!.click();
        expect(onChange).toHaveBeenCalledWith('default');
    });

    it('warns about a deleted id and names what it shows as now', async () => {
        setInjectedTheme(themeSummary(deleteWithReplacement(GRAPE_THEME, 'scheme', 'brand', 'inverted')));
        const { container } = await renderField(schemeField(), 'brand').screen;

        expect(container.querySelector('[data-theme-field-missing]')?.textContent).toContain('shows as Inverted');
    });

    it('shows variants as buttons and treats no value as Primary', async () => {
        setInjectedTheme(themeSummary(GRAPE_THEME));
        const { onChange, screen } = renderField(variantField(), undefined);
        const { container } = await screen;
        const buttons = [...container.querySelectorAll<HTMLButtonElement>('button')];

        expect(buttons.map((b) => b.textContent)).toEqual(['Primary', 'Secondary', 'Ghost', 'Accent']);
        expect(buttons[0]?.getAttribute('aria-pressed')).toBe('true');
        expect(getComputedStyle(buttons[3]!).backgroundColor).toBe('rgb(23, 120, 79)');
        buttons[3]!.click();
        expect(onChange).toHaveBeenCalledWith('accent');
        expect(container.querySelector('[data-theme-field-missing]')).toBeNull();
    });

    it('previews text styles in their own size and weight', async () => {
        setInjectedTheme(themeSummary(GRAPE_THEME));
        const { container } = await renderField(textStyleField({ allowNone: true }), 'h2').screen;

        expect(container.querySelector('button[aria-label="None"]')).not.toBeNull();
        const h2 = container.querySelector<HTMLButtonElement>('button[aria-label="Heading 2"]')!;
        expect(h2.getAttribute('aria-pressed')).toBe('true');
        expect(getComputedStyle(h2.firstElementChild as HTMLElement).fontWeight).toBe('600');
    });

    it('offers border presets with a sample, plus None and the theme default', async () => {
        setInjectedTheme(themeSummary(GRAPE_THEME));
        const { onChange, screen } = renderField(borderField({ allowInherit: true }), '');
        const { container } = await screen;
        const labels = [...container.querySelectorAll('button')].map((b) => b.getAttribute('aria-label'));

        expect(labels).toEqual(['Theme default', 'None', 'Subtle', 'Strong']);
        expect(container.querySelector('button[aria-label="Theme default"]')?.getAttribute('aria-pressed')).toBe('true');
        const strong = container.querySelector<HTMLButtonElement>('button[aria-label="Strong"]')!;
        expect(getComputedStyle(strong.querySelector('span span') as HTMLElement).borderTopWidth).toBe('2px');
        strong.click();
        expect(onChange).toHaveBeenCalledWith('strong');
    });

    it('reads no border as None where there is no theme default', async () => {
        const { container } = await renderField(borderField(), undefined).screen;

        expect(container.querySelector('button[aria-label="Theme default"]')).toBeNull();
        expect(container.querySelector('button[aria-label="None"]')?.getAttribute('aria-pressed')).toBe('true');
    });

    it('offers every side on its own and the common pairs', async () => {
        const { onChange, screen } = renderField(borderSidesField(), ['top', 'bottom'] as BorderSide[] | undefined);
        const { container } = await screen;
        const options = [...container.querySelectorAll<HTMLButtonElement>('[data-sides-picker] button:not([data-sides-preview])')];

        expect(options.map((b) => b.textContent)).toEqual(['All', 'Top & bottom', 'Left & right', 'Top', 'Right', 'Bottom', 'Left']);
        expect(options.filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent)).toEqual(['Top & bottom']);
        options[6]!.click();
        expect(onChange).toHaveBeenLastCalledWith(['left']);
        options[2]!.click();
        expect(onChange).toHaveBeenLastCalledWith(['right', 'left']);
    });

    it('steps to the next option when the preview is clicked', async () => {
        const preview = async (value: BorderSide[] | undefined) => {
            const { onChange, screen } = renderField(borderSidesField(), value);
            const { container } = await screen;
            const button = container.querySelector<HTMLButtonElement>('[data-sides-preview]')!;
            button.click();
            return { onChange, button };
        };

        const pair = await preview(['top', 'bottom']);
        expect(pair.button.getAttribute('aria-label')).toBe('Top & bottom. Switch to Left & right');
        expect(pair.onChange).toHaveBeenCalledWith(['right', 'left']);
        // The last option wraps around to All.
        expect((await preview(['left'])).onChange).toHaveBeenCalledWith(['top', 'right', 'bottom', 'left']);
        // So does a combination that isn't an option.
        expect((await preview(['top', 'left'])).onChange).toHaveBeenCalledWith(['top', 'right', 'bottom', 'left']);
    });

    it('turns a stored border into the attributes the theme CSS styles', () => {
        expect(borderAttrs('', ['top'])).toEqual({});
        expect(borderAttrs(undefined, undefined)).toEqual({});
        expect(borderAttrs('none', ['top'])).toEqual({ 'data-pp-border': 'none' });
        expect(borderAttrs('strong', ['left', 'top'])).toEqual({ 'data-pp-border': 'strong', 'data-pp-sides': 'top left' });
        // Sides saved before they were chosen: all four.
        expect(borderAttrs('strong', undefined)).toEqual({ 'data-pp-border': 'strong', 'data-pp-sides': 'top right bottom left' });
    });

    it('shows each picker under its label', async () => {
        const fields: [CustomField<any>, string][] = [
            [schemeField({ label: 'Card color scheme' }), 'Card color scheme'],
            [variantField(), 'Style'],
            [textStyleField(), 'Text style'],
            [borderField({ label: 'Card border' }), 'Card border'],
            [borderSidesField(), 'Border sides'],
        ];
        for (const [field, label] of fields) {
            const { container } = await renderField(field, undefined).screen;
            const picker = container.querySelector('[data-theme-field]')!;
            const labelText = [...container.querySelectorAll('*')].find((el) => el.childElementCount === 0 && el.textContent === label && !picker.contains(el));
            expect(labelText, label).toBeDefined();
            expect(labelText!.compareDocumentPosition(picker) & Node.DOCUMENT_POSITION_FOLLOWING, label).toBeTruthy();
        }
    });

    it('builds only the fields a component asks for', () => {
        expect(Object.keys(themeStyleFields({ scheme: {} }))).toEqual(['scheme']);
        expect(Object.keys(themeStyleFields({ scheme: {}, border: {} }))).toEqual(['scheme', 'border']);
        expect(Object.keys(themeStyleFields({ variant: {}, textStyle: {} }))).toEqual(['variant', 'textStyle']);
    });
});
