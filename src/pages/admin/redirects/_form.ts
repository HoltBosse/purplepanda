import type { InferSelectModel } from 'drizzle-orm';
import * as z from 'zod';
import type { redirects } from '../../../db/schema.js';
import { FormEncType, FormMethod, type FormSection } from '../../../form/types.js';

type Redirect = InferSelectModel<typeof redirects>;

const inputClassList = "w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring focus:ring-blue-200";

export function getRedirectForm(redirect: Redirect, fields: Record<string, any>, actionUrl: string, flash: Record<string, string> = {}): FormSection {
    return {
        id: 'redirect-form',
        title: 'Redirect',
        classList: "space-y-6",
        fields: [
            {
                id: 'redirect-group-wrapper',
                name: 'redirect-group-wrapper',
                type: 'Group',
                fields: fields,
                classList: "p-6 bg-base-100 rounded-lg",
                groupFields: [
                    {
                        id: 'redirect-group-header',
                        name: 'redirect-group-header',
                        type: 'Html',
                        markup: '<h2 class="text-lg font-medium">Redirect</h2>',
                    },
                    {
                        id: 'redirect-fields-group',
                        name: 'redirect-fields-group',
                        type: 'Group',
                        fields: fields,
                        classList: "grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6 mt-6",
                        groupFields: [
                            {
                                id: 'from',
                                name: 'from',
                                label: 'From path',
                                type: 'Input',
                                classList: inputClassList,
                                placeholder: '/old-path',
                                value: flash.from ?? redirect.from,
                                required: true,
                                validator: z.string().min(1, "From path is required").max(2048),
                            },
                            {
                                id: 'to',
                                name: 'to',
                                label: 'To path or URL',
                                type: 'Input',
                                classList: inputClassList,
                                placeholder: '/new-path',
                                value: flash.to ?? redirect.to,
                                required: true,
                                validator: z.string().min(1, "To path is required").max(2048),
                            },
                        ],
                    },
                ],
            },
        ],
        props: {
            action: actionUrl,
            method: FormMethod.POST,
            encType: FormEncType.URLENCODED,
        },
    };
}
