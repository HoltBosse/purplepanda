import * as z from 'zod';
import { getAllFields, getFieldByName } from '../../../form/index.js';
import type { FieldConfig, FormSection } from '../../../form/types.js';
import {
    type ComponentSettingField,
    type ComponentSettingValues,
    type ComponentWithSiteSettings,
    normalizeComponentSettings,
} from '../../../puck/component-settings.js';

// The settings page's sections for components' own site settings (see puck/component-settings.ts):
// one section per component, one row per field, built from the component's declaration so a new
// setting needs no changes here.

const inputClassList = "w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring focus:ring-blue-200 bg-base-100";
const fields = getAllFields();

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function fieldName(componentName: string, key: string): string {
    return `component-${componentName}-${key}`;
}

function clearFieldName(componentName: string, key: string): string {
    return `${fieldName(componentName, key)}-clear`;
}

// Form fields whose posted values must not be kept in the flash session after a failed save.
export function componentSecretFieldNames(components: ComponentWithSiteSettings[]): string[] {
    return components.flatMap((component) =>
        Object.entries(component.settings.fields)
            .filter(([, field]) => field.type === 'secret')
            .map(([key]) => fieldName(component.name, key)),
    );
}

function headerMarkup(field: ComponentSettingField): string {
    const label = `<h2 class="text-md font-medium settings-search-label">${escapeHtml(field.label)}</h2>`;
    if (!field.description) return `<div class="flex items-center">${label}</div>`;
    return `<div>${label}<p class="mt-1 text-sm text-base-content/60">${escapeHtml(field.description)}</p></div>`;
}

function inputFields(
    componentName: string,
    key: string,
    field: ComponentSettingField,
    stored: string | boolean | undefined,
    flash: Record<string, string>,
): FieldConfig[] {
    const name = fieldName(componentName, key);
    const base = { id: name, name, alertLabel: field.label };

    switch (field.type) {
        case 'text': {
            const value = flash[name] ?? (typeof stored === 'string' ? stored : undefined);
            const validator = field.pattern
                ? z.string().trim().regex(field.pattern, field.patternMessage ?? 'Invalid value').optional()
                : z.string().trim().optional();
            return [{
                ...base,
                type: 'Input',
                classList: inputClassList,
                placeholder: field.placeholder ?? field.default,
                ...(value ? { value } : {}),
                validator,
            }];
        }
        case 'secret': {
            // Never rendered back: the field starts empty and an empty post keeps the saved value.
            const saved = typeof stored === 'string' && stored.length > 0;
            const clearName = clearFieldName(componentName, key);
            return [{
                id: `${name}-wrapper`,
                name: `${name}-wrapper`,
                type: 'Group',
                fields,
                classList: 'flex flex-col gap-2',
                groupFields: [
                    {
                        ...base,
                        type: 'Input',
                        inputType: 'password',
                        autocomplete: 'new-password',
                        classList: inputClassList,
                        placeholder: saved ? 'Saved — leave blank to keep it' : (field.placeholder ?? 'Not set'),
                        validator: z.string().optional(),
                    },
                    ...(saved ? [{
                        id: clearName,
                        name: clearName,
                        type: 'Html',
                        markup: `<label class="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" class="checkbox checkbox-sm" name="${clearName}" value="1"> Remove the saved value</label>`,
                        validator: z.string().optional(),
                    }] : []),
                ],
            }];
        }
        case 'select': {
            const values = field.options.map((option) => option.value);
            const value = flash[name] ?? (typeof stored === 'string' ? stored : field.default);
            return [{
                ...base,
                type: 'Select',
                options: field.options.map((option) => ({ ...option })),
                classList: inputClassList,
                optionsClassList: 'bg-base-100 text-base-content',
                value,
                validator: z.string().refine((v) => values.includes(v), 'Choose one of the options').optional(),
            }];
        }
        case 'boolean': {
            const value = flash[name] ?? String(typeof stored === 'boolean' ? stored : field.default);
            return [{
                ...base,
                type: 'Select',
                options: [{ label: 'On', value: 'true' }, { label: 'Off', value: 'false' }],
                classList: inputClassList,
                optionsClassList: 'bg-base-100 text-base-content',
                value,
                validator: z.enum(['true', 'false']).optional(),
            }];
        }
    }
}

export function getComponentSettingsGroups(
    components: ComponentWithSiteSettings[],
    stored: Map<string, ComponentSettingValues>,
    flash: Record<string, string> = {},
): FieldConfig[] {
    return components.map(({ name, label, settings }) => {
        const values = stored.get(name);
        const wrapperId = `component-${name}-group-wrapper`;
        return {
            id: wrapperId,
            name: wrapperId,
            type: 'Group',
            fields,
            classList: 'p-6 bg-base-100 rounded-lg settings-search-section',
            groupFields: [
                {
                    id: `component-${name}-group-header`,
                    name: `component-${name}-group-header`,
                    type: 'Html',
                    markup: `<h2 class="text-lg font-medium settings-search-label">${escapeHtml(label)}</h2>`
                        + (settings.description ? `<p class="mt-1 text-sm text-base-content/60">${escapeHtml(settings.description)}</p>` : ''),
                },
                ...Object.entries(settings.fields).map(([key, field]) => ({
                    id: `${fieldName(name, key)}-group`,
                    name: `${fieldName(name, key)}-group`,
                    type: 'Group',
                    fields,
                    classList: 'grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6 mt-6',
                    groupFields: [
                        {
                            id: `${fieldName(name, key)}-header`,
                            name: `${fieldName(name, key)}-header`,
                            type: 'Html',
                            markup: headerMarkup(field),
                        },
                        ...inputFields(name, key, field, values?.[key], flash),
                    ],
                })),
            ],
        };
    });
}

// Each component's values to store, from a form that has passed validateForm. `stored` supplies
// the secrets a blank field keeps.
export function readComponentSettingsForm(
    form: FormSection,
    components: ComponentWithSiteSettings[],
    stored: Map<string, ComponentSettingValues>,
): Map<string, ComponentSettingValues> {
    return new Map(components.map(({ name, settings }) => {
        const previous = stored.get(name);
        const raw = Object.fromEntries(Object.entries(settings.fields).map(([key, field]) => {
            const value = getFieldByName(form, fieldName(name, key))?.value as string | undefined;
            switch (field.type) {
                case 'secret':
                    if (getFieldByName(form, clearFieldName(name, key))?.value) return [key, ''];
                    return [key, value || previous?.[key] || ''];
                case 'boolean':
                    return [key, value === undefined ? field.default : value === 'true'];
                default:
                    return [key, value ?? ''];
            }
        }));
        return [name, normalizeComponentSettings(settings, raw)];
    }));
}
