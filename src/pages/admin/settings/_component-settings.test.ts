import { describe, expect, it } from 'vitest';
import { getFieldByName, validateForm } from '../../../form/index.js';
import type { FormSection } from '../../../form/types.js';
import {
    type ComponentSettingValues,
    type ComponentWithSiteSettings,
    defineComponentSiteSettings,
    normalizeComponentSettings,
} from '../../../puck/component-settings.js';
import { componentSecretFieldNames, getComponentSettingsGroups, readComponentSettingsForm } from './_component-settings';

const settings = defineComponentSiteSettings({
    description: 'Widget <options>',
    fields: {
        siteKey: { type: 'text', label: 'Site Key' },
        secretKey: { type: 'secret', label: 'Secret Key' },
        theme: {
            type: 'select',
            label: 'Theme',
            options: [{ label: 'Light', value: 'light' }, { label: 'Dark', value: 'dark' }],
            default: 'light',
        },
        compact: { type: 'boolean', label: 'Compact', default: false },
        language: { type: 'text', label: 'Language', default: 'auto', pattern: /^(auto|[a-z]{2})$/, patternMessage: 'Bad language' },
    },
});

const components: ComponentWithSiteSettings[] = [{ name: 'Widget', label: 'Widget', settings }];

function storedWith(values: Record<string, unknown>): Map<string, ComponentSettingValues> {
    return new Map([['Widget', normalizeComponentSettings(settings, values)]]);
}

function formFor(stored: Map<string, ComponentSettingValues>, flash: Record<string, string> = {}): FormSection {
    return { id: 'f', title: 'f', fields: getComponentSettingsGroups(components, stored, flash) };
}

function submit(stored: Map<string, ComponentSettingValues>, posted: Record<string, string>) {
    const form = formFor(stored);
    const result = validateForm(form, posted);
    return { result, values: readComponentSettingsForm(form, components, stored).get('Widget') };
}

describe('getComponentSettingsGroups', () => {
    it('draws a section per component with a field per setting', () => {
        const form = formFor(storedWith({}));

        for (const key of ['siteKey', 'secretKey', 'theme', 'compact', 'language']) {
            expect(getFieldByName(form, `component-Widget-${key}`)).not.toBeNull();
        }
    });

    it('escapes declared text in its markup', () => {
        const [section] = formFor(storedWith({})).fields;

        expect(section?.groupFields?.[0]?.markup).toContain('Widget &lt;options&gt;');
    });

    it('fills fields with the stored values', () => {
        const form = formFor(storedWith({ siteKey: 'abc', theme: 'dark', compact: true }));

        expect(getFieldByName(form, 'component-Widget-siteKey')?.value).toBe('abc');
        expect(getFieldByName(form, 'component-Widget-theme')?.value).toBe('dark');
        expect(getFieldByName(form, 'component-Widget-compact')?.value).toBe('true');
    });

    it('prefers flashed values from a failed save', () => {
        const form = formFor(storedWith({ siteKey: 'abc' }), { 'component-Widget-siteKey': 'typed' });

        expect(getFieldByName(form, 'component-Widget-siteKey')?.value).toBe('typed');
    });

    it('never renders a saved secret back into the form', () => {
        const form = formFor(storedWith({ secretKey: 's3cret' }));

        expect(getFieldByName(form, 'component-Widget-secretKey')?.value).toBeUndefined();
        expect(JSON.stringify(form)).not.toContain('s3cret');
    });

    it('offers to remove a secret only once one is saved', () => {
        expect(getFieldByName(formFor(storedWith({})), 'component-Widget-secretKey-clear')).toBeNull();
        expect(getFieldByName(formFor(storedWith({ secretKey: 's3cret' })), 'component-Widget-secretKey-clear')).not.toBeNull();
    });
});

describe('readComponentSettingsForm', () => {
    it('reads posted values as the settings to store', () => {
        const { result, values } = submit(storedWith({}), {
            'component-Widget-siteKey': 'abc',
            'component-Widget-secretKey': 's3cret',
            'component-Widget-theme': 'dark',
            'component-Widget-compact': 'true',
            'component-Widget-language': 'en',
        });

        expect(result.success).toBe(true);
        expect(values).toEqual({ siteKey: 'abc', secretKey: 's3cret', theme: 'dark', compact: true, language: 'en' });
    });

    it('keeps the saved secret when its field is left blank', () => {
        const { values } = submit(storedWith({ secretKey: 's3cret' }), { 'component-Widget-secretKey': '' });

        expect(values?.secretKey).toBe('s3cret');
    });

    it('replaces the saved secret with a new one', () => {
        const { values } = submit(storedWith({ secretKey: 's3cret' }), { 'component-Widget-secretKey': 'n3w' });

        expect(values?.secretKey).toBe('n3w');
    });

    it('removes the saved secret when asked to', () => {
        const { values } = submit(storedWith({ secretKey: 's3cret' }), { 'component-Widget-secretKey-clear': '1' });

        expect(values?.secretKey).toBe('');
    });

    it('rejects a value outside a select field\'s options', () => {
        const { result } = submit(storedWith({}), { 'component-Widget-theme': 'neon' });

        expect(result.errors).toHaveProperty('component-Widget-theme');
    });

    it('rejects a text value not matching its pattern, with the declared message', () => {
        const { result } = submit(storedWith({}), { 'component-Widget-language': 'english please' });

        expect(result.errors['component-Widget-language']).toBe('Bad language');
    });
});

describe('componentSecretFieldNames', () => {
    it('names the secret fields, to keep them out of the flash session', () => {
        expect(componentSecretFieldNames(components)).toEqual(['component-Widget-secretKey']);
    });
});
