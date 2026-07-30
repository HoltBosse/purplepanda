import { FormMethod, FormEncType, type FormSection } from '../../../form/types.js';
import { type InferSelectModel } from 'drizzle-orm';
import { users } from '../../../db/schema.js';
import * as z from 'zod';
import { getAllFields } from '../../../form/index.js';
import { getDb } from '../../../db/db.js';
import { eq } from 'drizzle-orm';
import { templates } from '../../../db/schema.js';
import type { ContentType } from '../../../puck/index.js';

const db = getDb();
const allTemplatesOptions = await db.select().from(templates);

const inputClassList = "w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring focus:ring-blue-200 bg-base-100";
const fields = getAllFields();

export function getSettingsForm(
    defaultTemplateId?: string,
    turnstileSiteKey?: string,
    turnstileSecretKey?: string,
    flash: Record<string, string> = {},
    contentTypes: ContentType[] = [],
    contentTemplateDefaults: Record<string, string> = {},
): FormSection {
    const dtOptionValue = flash['dt-option'] ?? defaultTemplateId;
    const turnstileSiteKeyValue = flash['turnstile-site-key'] ?? turnstileSiteKey;
    const turnstileSecretKeyValue = flash['turnstile-secret-key'] ?? turnstileSecretKey;
    const contentTypeGroups = contentTypes.map((contentType) => {
        const templateFieldName = `content-default-template-${contentType.id}`;
        const defaultTemplateValue = flash[templateFieldName] ?? contentTemplateDefaults[contentType.id];

        return {
            id: `content-type-group-${contentType.id}`,
            name: `content-type-group-${contentType.id}`,
            type: 'Group' as const,
            fields,
            classList: 'mt-8 border-t border-base-300 pt-6',
            groupFields: [
                {
                    id: `content-type-header-${contentType.id}`,
                    name: `content-type-header-${contentType.id}`,
                    type: 'Html' as const,
                    markup: `<h3 class="text-md font-medium">${contentType.title}</h3>`,
                },
                {
                    id: `content-template-group-${contentType.id}`,
                    name: `content-template-group-${contentType.id}`,
                    type: 'Group' as const,
                    fields,
                    classList: 'grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6 mt-6',
                    groupFields: [
                        {
                            id: `content-template-header-${contentType.id}`,
                            name: `content-template-header-${contentType.id}`,
                            type: 'Html' as const,
                            markup: '<h2 class="text-md font-medium flex items-center settings-search-label">Default Template</h2>',
                        },
                        {
                            id: templateFieldName,
                            name: templateFieldName,
                            type: 'Select' as const,
                            options: allTemplatesOptions.map(template => ({
                                label: (template.content as any)?.root?.props?.title || 'Untitled',
                                value: template.id,
                            })),
                            placeholder: 'Select a template',
                            classList: inputClassList,
                            optionsClassList: 'bg-base-100 text-base-content',
                            ...(defaultTemplateValue ? { value: defaultTemplateValue } : {}),
                            validator: z.string().optional(),
                        },
                    ],
                },
                {
                    id: `content-prefab-group-${contentType.id}`,
                    name: `content-prefab-group-${contentType.id}`,
                    type: 'Group' as const,
                    fields,
                    classList: 'grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6 mt-6',
                    groupFields: [
                        {
                            id: `content-prefab-header-${contentType.id}`,
                            name: `content-prefab-header-${contentType.id}`,
                            type: 'Html' as const,
                            markup: '<h2 class="text-md font-medium flex items-center settings-search-label">Default Prefab</h2>',
                        },
                        {
                            id: `content-prefab-option-${contentType.id}`,
                            name: `content-prefab-option-${contentType.id}`,
                            type: 'Html' as const,
                            markup: `<div class="flex items-center justify-end gap-2">
                                <a href="/admin/settings/prefab/history/${contentType.id}" class="btn btn-ghost btn-sm btn-square" title="Source Control">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-git-branch"><path d="M15 6a9 9 0 0 0-9 9V3"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/></svg>
                                </a>
                                <a href="/admin/settings/prefab/${contentType.id}" class="btn btn-ghost btn-sm">Edit</a>
                            </div>`,
                        },
                    ],
                },
            ],
        };
    });

    return {
        id: 'settings-form',
        title: 'Settings',
        classList: "space-y-6",
        fields: [
            {
                id: 'dt-group-wrapper',
                name: 'dt-group-wrapper',
                type: "Group",
                fields: fields,
                classList: "p-6 bg-base-100 rounded-lg settings-search-section",
                groupFields: [
                    {
                        id: 'dt-group-header',
                        name: 'dt-group-header',
                        type: 'Html',
                        markup: '<h2 class="text-lg font-medium settings-search-label">Pages</h2>',
                    },
                    {
                        id: 'dt-group',
                        name: 'dt-group',
                        type: "Group",
                        fields: fields,
                        classList: "grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6 mt-6",
                        groupFields: [
                            {
                                id: 'dt-group-header',
                                name: 'dt-group-header',
                                type: 'Html',
                                markup: '<h2 class="text-md font-medium flex items-center settings-search-label">Default Template</h2>',
                            },
                            {
                                id: 'dt-option',
                                name: 'dt-option',
                                type: 'Select',
                                options: allTemplatesOptions.map(template => ({
                                    label: (template.content as any)?.root?.props?.title || 'Untitled',
                                    value: template.id,
                                })),
                                placeholder: 'Select a template',
                                classList: inputClassList,
                                optionsClassList: "bg-base-100 text-base-content",
                                ...(dtOptionValue ? { value: dtOptionValue } : {}),
                                required: true,
                                validator: z.string().min(1, "Last name is required"),
                            },
                        ],
                    },
                    {
                        id: 'dp-group',
                        name: 'dp-group',
                        type: "Group",
                        fields: fields,
                        classList: "grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6 mt-6",
                        groupFields: [
                            {
                                id: 'dp-group-header',
                                name: 'dp-group-header',
                                type: 'Html',
                                markup: '<h2 class="text-md font-medium flex items-center settings-search-label">Default Prefab</h2>',
                            },
                            {
                                id: 'dp-option',
                                name: 'dp-option',
                                type: 'Html',
                                markup: `<div class="flex items-center justify-end gap-2">
                                    <a href="/admin/settings/prefab/history/default" class="btn btn-ghost btn-sm btn-square" title="Source Control">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-git-branch"><path d="M15 6a9 9 0 0 0-9 9V3"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/></svg>
                                    </a>
                                    <a href="/admin/settings/prefab/default" class="btn btn-ghost btn-sm">Edit</a>
                                </div>`,
                            },
                        ],
                    },
                ]
            },
            {
                id: 'content-group-wrapper',
                name: 'content-group-wrapper',
                type: 'Group',
                fields: fields,
                classList: 'p-6 bg-base-100 rounded-lg settings-search-section',
                groupFields: [
                    {
                        id: 'content-group-header',
                        name: 'content-group-header',
                        type: 'Html',
                        markup: '<h2 class="text-lg font-medium settings-search-label">Content</h2>',
                    },
                    ...contentTypeGroups,
                ],
            },
            {
                id: 'turnstile-group-wrapper',
                name: 'turnstile-group-wrapper',
                type: "Group",
                fields: fields,
                classList: "p-6 bg-base-100 rounded-lg settings-search-section",
                groupFields: [
                    {
                        id: 'turnstile-group-header',
                        name: 'turnstile-group-header',
                        type: 'Html',
                        markup: '<h2 class="text-lg font-medium settings-search-label">Turnstile</h2>',
                    },
                    {
                        id: 'turnstile-site-key-group',
                        name: 'turnstile-site-key-group',
                        type: "Group",
                        fields: fields,
                        classList: "grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6 mt-6",
                        groupFields: [
                            {
                                id: 'turnstile-site-key-header',
                                name: 'turnstile-site-key-header',
                                type: 'Html',
                                markup: '<h2 class="text-md font-medium flex items-center settings-search-label">Site Key</h2>',
                            },
                            {
                                id: 'turnstile-site-key',
                                name: 'turnstile-site-key',
                                type: 'Input',
                                classList: inputClassList,
                                ...(turnstileSiteKeyValue ? { value: turnstileSiteKeyValue } : {}),
                                validator: z.string().optional(),
                            },
                        ],
                    },
                    {
                        id: 'turnstile-secret-key-group',
                        name: 'turnstile-secret-key-group',
                        type: "Group",
                        fields: fields,
                        classList: "grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6 mt-6",
                        groupFields: [
                            {
                                id: 'turnstile-secret-key-header',
                                name: 'turnstile-secret-key-header',
                                type: 'Html',
                                markup: '<h2 class="text-md font-medium flex items-center settings-search-label">Secret Key</h2>',
                            },
                            {
                                id: 'turnstile-secret-key',
                                name: 'turnstile-secret-key',
                                type: 'Input',
                                inputType: 'password',
                                classList: inputClassList,
                                ...(turnstileSecretKeyValue ? { value: turnstileSecretKeyValue } : {}),
                                validator: z.string().optional(),
                            },
                        ],
                    }
                ]
            }
        ],
        props: {
            action: "/admin/settings/update",
            method: FormMethod.POST,
            encType: FormEncType.URLENCODED,
        },
    };
}
