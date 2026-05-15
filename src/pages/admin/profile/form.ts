import { FormMethod, FormEncType, type FormSection } from '../../../form/types.js';
import { type InferSelectModel } from 'drizzle-orm';
import { users } from '../../../db/schema.js';
import * as z from 'zod';

type User = InferSelectModel<typeof users>;

const inputClassList = "w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring focus:ring-blue-200";

export function getProfileForm(user: User, fields: Record<string, any>, flash: Record<string, string> = {}): FormSection {
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
						markup: '<h2 class="text-lg font-medium">Change Password</h2>',
					},
					{
						id: 'password-group',
						name: 'password-group',
						type: "Group",
						fields: fields,
						classList: "grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6 mt-6",
						groupFields: [
							{
								id: 'current-password',
								name: 'current-password',
								label: 'Current Password',
								type: 'Input',
                                classList: inputClassList,
                                ...(flash['current-password'] ? { value: flash['current-password'] } : {}),
                                validator: z.string().min(1, "Current password is required").optional(),
							},
							{
								id: 'dummy-plug',
								name: 'dummy-plug',
								type: 'Html',
								markup: '<div class="hidden lg:block"></div>',
							},
							{
								id: 'new-password',
								name: 'new-password',
								label: 'New Password',
								type: 'Input',
                                classList: inputClassList,
                                ...(flash['new-password'] ? { value: flash['new-password'] } : {}),
                                validator: z.string().min(8, "New password must be at least 8 characters").optional(),
							},
							{
								id: 'confirm-new-password',
								name: 'confirm-new-password',
								label: 'Confirm New Password',
								type: 'Input',
                                classList: inputClassList,
                                ...(flash['confirm-new-password'] ? { value: flash['confirm-new-password'] } : {}),
                                validator: z.string().min(8, "Confirm new password must be at least 8 characters").optional(),
							},
						],
					}
				]
			}
		],
		props: {
			action: '/admin/profile/update',
			method: FormMethod.POST,
			encType: FormEncType.URLENCODED,
		},
	};
}
