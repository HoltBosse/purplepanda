import { FormMethod, FormEncType, type FormSection } from '../../../form/types.js';
import { type InferSelectModel } from 'drizzle-orm';
import { tags } from '../../../db/schema.js';
import * as z from 'zod';

type Tag = InferSelectModel<typeof tags>;

const inputClassList = "w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring focus:ring-blue-200";

export function getTagForm(tag: Tag, fields: Record<string, any>, actionUrl: string, parentOptions: { value: string; label: string }[], flash: Record<string, string> = {}): FormSection {
    return {
        id: 'tag-form',
        title: 'Tag',
        classList: "space-y-6",
        fields: [
            {
                id: 'tag-group-wrapper',
                name: 'tag-group-wrapper',
                type: 'Group',
                fields: fields,
                classList: "p-6 bg-base-100 rounded-lg",
                groupFields: [
                    {
                        id: 'tag-group-header',
                        name: 'tag-group-header',
                        type: 'Html',
                        markup: '<h2 class="text-lg font-medium">Tag</h2>',
                    },
                    {
                        id: 'tag-fields-group',
                        name: 'tag-fields-group',
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
                                placeholder: 'Tag title',
                                value: flash['title'] ?? tag.title,
                                required: true,
                                validator: z.string().min(1, "Title is required").max(255),
                            },
                            {
                                id: 'parentTag',
                                name: 'parentTag',
                                label: 'Parent tag',
                                type: 'Select',
                                classList: inputClassList,
                                optionsClassList: "bg-base-100 text-base-content",
                                options: parentOptions,
                                value: flash['parentTag'] ?? tag.parentTag ?? '',
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
