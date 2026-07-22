import { FormMethod, FormEncType, type FormSection } from '../../../form/types.js';
import { type InferSelectModel } from 'drizzle-orm';
import { users } from '../../../db/schema.js';
import { capitalize } from '../../../string/index.js';
import * as z from 'zod';

type User = InferSelectModel<typeof users>;

const inputClassList = "w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring focus:ring-blue-200";

const DAISYUI_THEMES = [
	'light', 'dark', 'cupcake', 'bumblebee', 'emerald', 'corporate', 'synthwave', 'retro',
	'cyberpunk', 'valentine', 'halloween', 'garden', 'forest', 'aqua', 'lofi', 'pastel',
	'fantasy', 'wireframe', 'black', 'luxury', 'dracula', 'cmyk', 'autumn', 'business',
	'acid', 'lemonade', 'night', 'coffee', 'winter', 'dim', 'nord', 'sunset',
	'caramellatte', 'abyss', 'silk',
];

const THEME_OPTIONS = [
	{ value: 'system', label: 'System' },
	...DAISYUI_THEMES.map((theme) => ({ value: theme, label: capitalize(theme) })),
];

const THEME_VALUES = THEME_OPTIONS.map((option) => option.value) as [string, ...string[]];

export function getProfileForm(user: User, fields: Record<string, any>, redirectUrl: string, flash: Record<string, string> = {}, showCurrentPassword: boolean = false, roleOptions: { value: string; label: string }[] = [], selectedRoleIds: string[] = []): FormSection {
	return {
		id: 'profile-form',
		title: 'Profile',
		classList: "space-y-6",
		fields: [
			{
				id: 'profile-group-wrapper',
				name: 'profile-group-wrapper',
				type: "Group",
				fields: fields,
				classList: "p-6 bg-base-100 rounded-lg",
				groupFields: [
					{
						id: 'profile-group-header',
						name: 'profile-group-header',
						type: 'Html',
						markup: '<h2 class="text-lg font-medium">Profile</h2>',
					},
					{
						id: 'profile-group',
						name: 'profile-group',
						type: "Group",
						fields: fields,
						classList: "grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6 mt-6",
						groupFields: [
							{
								id: 'fname',
								name: 'fname',
								label: 'First Name',
								type: 'Input',
								classList: inputClassList,
								value: flash['fname'] ?? user.fname,
								required: true,
								validator: z.string().min(1, "First name is required"),
							},
							{
								id: 'lname',
								name: 'lname',
								label: 'Last Name',
								type: 'Input',
								classList: inputClassList,
								value: flash['lname'] ?? user.lname,
								required: true,
								validator: z.string().min(1, "Last name is required"),
							},
							{
								id: 'email',
								name: 'email',
								label: 'Email',
								type: 'Input',
								classList: inputClassList,
								value: flash['email'] ?? user.email,
								required: true,
								validator: z.string().email("Invalid email address"),
							},
							{
								id: 'theme',
								name: 'theme',
								label: 'Theme',
								type: 'Select',
								classList: inputClassList,
								optionsClassList: "bg-base-100 text-base-content",
								options: THEME_OPTIONS,
								value: flash['theme'] ?? user.theme,
								required: true,
								validator: z.enum(THEME_VALUES, { message: "Invalid theme" }),
							}
						],
					}
				]
			},
			{
				id: 'password-group-wrapper',
				name: 'password-group-wrapper',
				type: "Group",
				fields: fields,
				classList: "p-6 bg-base-100 rounded-lg",
				groupFields: [
					{
						id: 'password-group-header',
						name: 'password-group-header',
						type: 'Html',
						markup: `<h2 class="text-lg font-medium">${showCurrentPassword ? 'Change Password' : 'Set Password'}</h2>`,
					},
					{
						id: 'password-group',
						name: 'password-group',
						type: "Group",
						fields: fields,
						classList: "grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6 mt-6",
						groupFields: [
							...(showCurrentPassword ? [{
								id: 'current-password',
								name: 'current-password',
								label: 'Current Password',
								type: 'Input',
                                inputType: 'password',
                                classList: inputClassList,
                                ...(flash['current-password'] ? { value: flash['current-password'] } : {}),
                                validator: z.string().min(1, "Current password is required").optional(),
							}] : []),
							...(showCurrentPassword ? [{
								id: 'dummy-plug',
								name: 'dummy-plug',
								type: 'Html',
								markup: '<div class="hidden lg:block"></div>',
							}] : []),
							{
								id: 'new-password',
								name: 'new-password',
								label: showCurrentPassword ? 'New Password' : 'Password',
								type: 'Input',
                                inputType: 'password',
                                classList: inputClassList,
                                ...(flash['new-password'] ? { value: flash['new-password'] } : {}),
                                validator: z.string().min(8, "New password must be at least 8 characters").optional(),
							},
							{
								id: 'confirm-new-password',
								name: 'confirm-new-password',
								label: showCurrentPassword ? 'Confirm New Password' : 'Confirm Password',
								type: 'Input',
                                inputType: 'password',
                                classList: inputClassList,
                                ...(flash['confirm-new-password'] ? { value: flash['confirm-new-password'] } : {}),
                                validator: z.string().min(8, "Confirm new password must be at least 8 characters").optional(),
							},
						],
					}
				]
			},
			...(roleOptions.length > 0 ? [{
				id: 'roles-group-wrapper',
				name: 'roles-group-wrapper',
				type: "Group",
				fields: fields,
				classList: "p-6 bg-base-100 rounded-lg",
				groupFields: [
					{
						id: 'roles-group-header',
						name: 'roles-group-header',
						type: 'Html',
						markup: '<h2 class="text-lg font-medium">Roles</h2>',
					},
					{
						id: 'roles',
						name: 'roles[]',
						label: 'Roles',
						type: 'Select',
						classList: inputClassList,
						optionsClassList: "bg-base-100 text-base-content",
						options: roleOptions,
						value: selectedRoleIds as unknown as string,
						multiple: true,
						description: 'Hold Ctrl (Windows) or Cmd (Mac) to select multiple roles.',
					},
				],
			}] : []),
		],
		props: {
			action: redirectUrl,
			method: FormMethod.POST,
			encType: FormEncType.URLENCODED,
		},
	};
}
