import * as z from 'zod';
import { getDb } from '../../../db/db.js';
import { templates } from '../../../db/schema.js';
import { getAllFields } from '../../../form/index.js';
import { FormEncType, FormMethod, type FormSection } from '../../../form/types.js';
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
    headingFontLink?: string,
    bodyFontLink?: string,
    fontFamilies: string[] = [],
    siteName?: string,
    emailHost?: string,
    emailAddress?: string,
    emailPassword?: string,
): FormSection {
    const siteNameValue = flash['site-name'] ?? siteName;
    const dtOptionValue = flash['dt-option'] ?? defaultTemplateId;
    const turnstileSiteKeyValue = flash['turnstile-site-key'] ?? turnstileSiteKey;
    const turnstileSecretKeyValue = flash['turnstile-secret-key'] ?? turnstileSecretKey;
    const headingFontValue = flash['heading-font'] ?? headingFontLink;
    const bodyFontValue = flash['body-font'] ?? bodyFontLink;
    const emailHostValue = flash['email-host'] ?? emailHost;
    const emailAddressValue = flash['email-address'] ?? emailAddress;
    const emailPasswordValue = flash['email-password'] ?? emailPassword;
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
                id: 'site-group-wrapper',
                name: 'site-group-wrapper',
                type: "Group",
                fields: fields,
                classList: "p-6 bg-base-100 rounded-lg settings-search-section",
                groupFields: [
                    {
                        id: 'site-group-header',
                        name: 'site-group-header',
                        type: 'Html',
                        markup: '<h2 class="text-lg font-medium settings-search-label">Site</h2>',
                    },
                    {
                        id: 'site-name-group',
                        name: 'site-name-group',
                        type: "Group",
                        fields: fields,
                        classList: "grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6 mt-6",
                        groupFields: [
                            {
                                id: 'site-name-header',
                                name: 'site-name-header',
                                type: 'Html',
                                markup: '<h2 class="text-md font-medium flex items-center settings-search-label">Site Name</h2>',
                            },
                            {
                                id: 'site-name',
                                name: 'site-name',
                                type: 'Input',
                                classList: inputClassList,
                                ...(siteNameValue ? { value: siteNameValue } : {}),
                                validator: z.string().optional(),
                            },
                        ],
                    },
                ],
            },
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
                id: 'fonts-group-wrapper',
                name: 'fonts-group-wrapper',
                type: "Group",
                fields: fields,
                classList: "p-6 bg-base-100 rounded-lg settings-search-section",
                groupFields: [
                    {
                        id: 'fonts-group-header',
                        name: 'fonts-group-header',
                        type: 'Html',
                        markup: '<h2 class="text-lg font-medium settings-search-label">Fonts</h2>',
                    },
                    {
                        id: 'heading-font-group',
                        name: 'heading-font-group',
                        type: "Group",
                        fields: fields,
                        classList: "grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6 mt-6",
                        groupFields: [
                            {
                                id: 'heading-font-header',
                                name: 'heading-font-header',
                                type: 'Html',
                                markup: '<h2 class="text-md font-medium flex items-center settings-search-label">Heading Font</h2>',
                            },
                            {
                                id: 'heading-font',
                                name: 'heading-font',
                                type: 'FontPicker',
                                placeholder: 'Select a heading font',
                                sampleText: 'Heading Sample',
                                fontFamilies,
                                ...(headingFontValue ? { value: headingFontValue } : {}),
                                validator: z.string().optional(),
                            },
                        ],
                    },
                    {
                        id: 'body-font-group',
                        name: 'body-font-group',
                        type: "Group",
                        fields: fields,
                        classList: "grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6 mt-6",
                        groupFields: [
                            {
                                id: 'body-font-header',
                                name: 'body-font-header',
                                type: 'Html',
                                markup: '<h2 class="text-md font-medium flex items-center settings-search-label">Body Font</h2>',
                            },
                            {
                                id: 'body-font',
                                name: 'body-font',
                                type: 'FontPicker',
                                placeholder: 'Select a body font',
                                sampleText: 'The quick brown fox jumps over the lazy dog',
                                fontFamilies,
                                ...(bodyFontValue ? { value: bodyFontValue } : {}),
                                validator: z.string().optional(),
                            },
                        ],
                    },
                ],
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
            },
            {
                id: 'email-group-wrapper',
                name: 'email-group-wrapper',
                type: "Group",
                fields: fields,
                classList: "p-6 bg-base-100 rounded-lg settings-search-section",
                groupFields: [
                    {
                        id: 'email-group-header',
                        name: 'email-group-header',
                        type: 'Html',
                        markup: '<h2 class="text-lg font-medium settings-search-label">Email</h2>',
                    },
                    {
                        id: 'email-host-group',
                        name: 'email-host-group',
                        type: "Group",
                        fields: fields,
                        classList: "grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6 mt-6",
                        groupFields: [
                            {
                                id: 'email-host-header',
                                name: 'email-host-header',
                                type: 'Html',
                                markup: '<h2 class="text-md font-medium flex items-center settings-search-label">Host</h2>',
                            },
                            {
                                id: 'email-host',
                                name: 'email-host',
                                type: 'Input',
                                inputType: 'text',
                                placeholder: 'smtp.example.com',
                                classList: inputClassList,
                                ...(emailHostValue ? { value: emailHostValue } : {}),
                                validator: z.string().optional(),
                            },
                        ],
                    },
                    {
                        id: 'email-address-group',
                        name: 'email-address-group',
                        type: "Group",
                        fields: fields,
                        classList: "grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6 mt-6",
                        groupFields: [
                            {
                                id: 'email-address-header',
                                name: 'email-address-header',
                                type: 'Html',
                                markup: '<h2 class="text-md font-medium flex items-center settings-search-label">Email</h2>',
                            },
                            {
                                id: 'email-address',
                                name: 'email-address',
                                type: 'Input',
                                inputType: 'email',
                                placeholder: 'noreply@example.com',
                                classList: inputClassList,
                                ...(emailAddressValue ? { value: emailAddressValue } : {}),
                                validator: z.string().optional(),
                            },
                        ],
                    },
                    {
                        id: 'email-password-group',
                        name: 'email-password-group',
                        type: "Group",
                        fields: fields,
                        classList: "grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6 mt-6",
                        groupFields: [
                            {
                                id: 'email-password-header',
                                name: 'email-password-header',
                                type: 'Html',
                                markup: '<h2 class="text-md font-medium flex items-center settings-search-label">Password</h2>',
                            },
                            {
                                id: 'email-password',
                                name: 'email-password',
                                type: 'Input',
                                inputType: 'password',
                                classList: inputClassList,
                                ...(emailPasswordValue ? { value: emailPasswordValue } : {}),
                                validator: z.string().optional(),
                            },
                        ],
                    },
                    {
                        id: 'email-test-group',
                        name: 'email-test-group',
                        type: 'Html',
                        markup: `<div class="flex items-center justify-end gap-3 mt-6">
                            <span id="email-test-result" class="text-sm hidden"></span>
                            <button type="button" id="email-test-credentials" class="btn btn-outline btn-sm">Test Credentials</button>
                        </div>`,
                    },
                ],
            },
        ],
        props: {
            action: "/admin/settings/update",
            method: FormMethod.POST,
            encType: FormEncType.URLENCODED,
        },
    };
}
