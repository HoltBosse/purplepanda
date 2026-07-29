import { FormMethod, FormEncType, type FormSection } from '../../../form/types.js';
import { type InferSelectModel } from 'drizzle-orm';
import { users } from '../../../db/schema.js';
import * as z from 'zod';
import { getAllFields } from '../../../form/index.js';
import { getDb } from '../../../db/db.js';
import { eq } from 'drizzle-orm';
import { templates } from '../../../db/schema.js';

const db = getDb();
const allTemplatesOptions = await db.select().from(templates);

const inputClassList = "w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring focus:ring-blue-200 bg-base-100";
const fields = getAllFields();

export function getSettingsForm(defaultTemplateId?: string, turnstileSiteKey?: string, turnstileSecretKey?: string, flash: Record<string, string> = {}): FormSection {
    const dtOptionValue = flash['dt-option'] ?? defaultTemplateId;
    const turnstileSiteKeyValue = flash['turnstile-site-key'] ?? turnstileSiteKey;
    const turnstileSecretKeyValue = flash['turnstile-secret-key'] ?? turnstileSecretKey;
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
                classList: "p-6 bg-base-100 rounded-lg",
                groupFields: [
                    {
                        id: 'dt-group-header',
                        name: 'dt-group-header',
                        type: 'Html',
                        markup: '<h2 class="text-lg font-medium">Pages</h2>',
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
                                markup: '<h2 class="text-md font-medium flex items-center">Default Template</h2>',
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
                    }
                ]
            },
            {
                id: 'turnstile-group-wrapper',
                name: 'turnstile-group-wrapper',
                type: "Group",
                fields: fields,
                classList: "p-6 bg-base-100 rounded-lg",
                groupFields: [
                    {
                        id: 'turnstile-group-header',
                        name: 'turnstile-group-header',
                        type: 'Html',
                        markup: '<h2 class="text-lg font-medium">Turnstile</h2>',
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
                                markup: '<h2 class="text-md font-medium flex items-center">Site Key</h2>',
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
                                markup: '<h2 class="text-md font-medium flex items-center">Secret Key</h2>',
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
