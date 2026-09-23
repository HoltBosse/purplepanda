import type { InferSelectModel } from 'drizzle-orm';
import * as z from 'zod';
import type { roles } from '../../../../db/schema.js';
import { FormEncType, FormMethod, type FormSection } from '../../../../form/types.js';

type Role = InferSelectModel<typeof roles>;

const inputClassList = "w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring focus:ring-blue-200";

const adminAccessOptions = [
    { value: 'true', label: 'Yes' },
    { value: 'false', label: 'No' },
];

export function getRoleForm(role: Role, fields: Record<string, any>, actionUrl: string, flash: Record<string, string> = {}): FormSection {
    return {
        id: 'role-form',
        title: 'Role',
        classList: "space-y-6",
        fields: [
            {
                id: 'role-group-wrapper',
                name: 'role-group-wrapper',
                type: 'Group',
                fields: fields,
                classList: "p-6 bg-base-100 rounded-lg",
                groupFields: [
                    {
                        id: 'role-group-header',
                        name: 'role-group-header',
                        type: 'Html',
                        markup: '<h2 class="text-lg font-medium">Role</h2>',
                    },
                    {
                        id: 'role-fields-group',
                        name: 'role-fields-group',
                        type: 'Group',
                        fields: fields,
                        classList: "grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6 mt-6",
                        groupFields: [
                            {
                                id: 'title',
                                name: 'title',
                                label: 'Title',
                                type: 'Input',
                                classList: inputClassList,
                                placeholder: 'Role title',
                                value: flash.title ?? role.title,
                                required: true,
                                validator: z.string().min(1, "Title is required").max(255),
                            },
                            {
                                id: 'adminAccess',
                                name: 'adminAccess',
                                label: 'Admin Access',
                                type: 'Select',
                                classList: inputClassList,
                                optionsClassList: "bg-base-100 text-base-content",
                                options: adminAccessOptions,
                                value: flash.adminAccess ?? String(role.adminAccess ?? false),
                                required: true,
                                validator: z.enum(['true', 'false']),
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
