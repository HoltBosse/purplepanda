import type { Config } from '@puckeditor/core';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import {
    componentSettingsKey,
    componentsWithSiteSettings,
    defineComponentSiteSettings,
    normalizeComponentSettings,
    publicComponentSettings,
} from './component-settings';

const settings = defineComponentSiteSettings({
    fields: {
        apiKey: { type: 'text', label: 'API key' },
        secret: { type: 'secret', label: 'Secret' },
        mode: {
            type: 'select',
            label: 'Mode',
            options: [{ label: 'Fast', value: 'fast' }, { label: 'Slow', value: 'slow' }],
            default: 'fast',
        },
        enabled: { type: 'boolean', label: 'Enabled', default: true },
        locale: { type: 'text', label: 'Locale', default: 'auto', pattern: /^(auto|[a-z]{2})$/ },
    },
});

const render = () => createElement('div');

describe('normalizeComponentSettings', () => {
    it('reads nothing stored as every field at its default', () => {
        expect(normalizeComponentSettings(settings, undefined)).toEqual({
            apiKey: '',
            secret: '',
            mode: 'fast',
            enabled: true,
            locale: 'auto',
        });
    });

    it('keeps valid stored values', () => {
        const stored = { apiKey: 'abc', secret: 's3cret', mode: 'slow', enabled: false, locale: 'en' };

        expect(normalizeComponentSettings(settings, stored)).toEqual(stored);
    });

    it('falls back to the default for a value that no longer fits its field', () => {
        const stored = { apiKey: 42, mode: 'warp', enabled: 'yes', locale: 'not a locale' };

        expect(normalizeComponentSettings(settings, stored)).toEqual({
            apiKey: '',
            secret: '',
            mode: 'fast',
            enabled: true,
            locale: 'auto',
        });
    });

    it('reads a blank text field as its default', () => {
        expect(normalizeComponentSettings(settings, { locale: '  ' }).locale).toBe('auto');
    });

    it('drops keys the component no longer declares', () => {
        expect(normalizeComponentSettings(settings, { removed: 'x' })).not.toHaveProperty('removed');
    });
});

describe('publicComponentSettings', () => {
    it('leaves out secret fields', () => {
        const values = normalizeComponentSettings(settings, { apiKey: 'abc', secret: 's3cret' });

        expect(publicComponentSettings(settings, values)).toEqual({
            apiKey: 'abc',
            mode: 'fast',
            enabled: true,
            locale: 'auto',
        });
    });
});

describe('componentsWithSiteSettings', () => {
    const config: Partial<Config> = {
        components: {
            Plain: { render },
            Labelled: { label: 'Fancy widget', siteSettings: settings, render },
            Titled: { label: 'Ignored', siteSettings: { ...settings, label: 'Section title' }, render },
            Hidden: { siteSettings: settings, render },
        },
    };

    it('lists only components declaring site settings, minus the disabled ones', () => {
        expect(componentsWithSiteSettings(config, new Set(['Hidden'])).map((c) => c.name)).toEqual(['Labelled', 'Titled']);
    });

    it('titles each by its settings label, then the component label, then its name', () => {
        expect(componentsWithSiteSettings(config).map((c) => c.label)).toEqual(['Fancy widget', 'Section title', 'Hidden']);
    });
});

describe('componentSettingsKey', () => {
    it('namespaces the settings row by component name', () => {
        expect(componentSettingsKey('Turnstile')).toBe('component:Turnstile');
    });
});
