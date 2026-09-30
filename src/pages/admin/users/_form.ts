import type { InferSelectModel } from 'drizzle-orm';
import * as z from 'zod';
import type { users } from '../../../db/schema.js';
import { type FieldConfig, FormEncType, FormMethod, type FormSection } from '../../../form/types.js';
import { inputClassList } from '../profile/_form.js';

type User = InferSelectModel<typeof users>;
type RoleOption = { value: string; label: string };

// A site's admin never sets anyone's password or email: inviting someone sends them a link to set
// up their own password (or, for an account that already exists, just adds it to the site), and
// editing a member only changes their name and roles here. Everything else is the account owner's,
// from their own profile. See update/[...id].ts.

const nameValidators = {
	fname: z.string().trim().min(1, "First name is required").max(255, "First name is too long"),
	lname: z.string().trim().min(1, "Last name is required").max(255, "Last name is too long"),
};

function section(id: string, heading: string, fields: Record<string, any>, groupFields: FieldConfig[], description?: string): FieldConfig {
	return {
		id: `${id}-group-wrapper`,
		name: `${id}-group-wrapper`,
		type: "Group",
		fields,
		classList: "p-6 bg-base-100 rounded-lg",
		groupFields: [
			{
				id: `${id}-group-header`,
				name: `${id}-group-header`,
				type: 'Html',
				markup: `<h2 class="text-lg font-medium">${heading}</h2>${description ? `<p class="mt-2 text-sm opacity-70">${description}</p>` : ''}`,
			},
			{
				id: `${id}-group`,
				name: `${id}-group`,
				type: "Group",
				fields,
				classList: "grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6 mt-6",
				groupFields,
			},
		],
	};
}

function nameFields(values: { fname: string; lname: string }): FieldConfig[] {
	return [
		{
			id: 'fname',
			name: 'fname',
			label: 'First Name',
			type: 'Input',
			classList: inputClassList,
			value: values.fname,
			required: true,
			validator: nameValidators.fname,
		},
		{
			id: 'lname',
			name: 'lname',
			label: 'Last Name',
			type: 'Input',
			classList: inputClassList,
			value: values.lname,
			required: true,
			validator: nameValidators.lname,
		},
	];
}

function rolesSection(fields: Record<string, any>, roleOptions: RoleOption[], selectedRoleIds: string[]): FieldConfig[] {
	if (roleOptions.length === 0) return [];
	return [section('roles', 'Roles', fields, [
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
	])];
}

function form(fieldList: FieldConfig[], action: string): FormSection {
	return {
		id: 'user-form',
		title: 'User',
		classList: "space-y-6",
		fields: fieldList,
		props: { action, method: FormMethod.POST, encType: FormEncType.URLENCODED },
	};
}

export function getInviteForm(fields: Record<string, any>, action: string, flash: Record<string, string> = {}, roleOptions: RoleOption[] = [], selectedRoleIds: string[] = []): FormSection {
	return form([
		section('invite', 'Invite', fields, [
			...nameFields({ fname: flash.fname ?? '', lname: flash.lname ?? '' }),
			{
				id: 'email',
				name: 'email',
				label: 'Email',
				type: 'Input',
				inputType: 'email',
				classList: inputClassList,
				value: flash.email ?? '',
				required: true,
				validator: z.string().trim().max(255, "Email is too long").pipe(z.email("Invalid email address")),
			},
		], "We'll email them a link to set up their password. If they already have an account on another site, it's added to this one as it is — its name and password don't change — and we'll let them know."),
		...rolesSection(fields, roleOptions, selectedRoleIds),
	], action);
}

export interface EditUserFormOptions {
	// The account is shared with other tenants (or is a super admin's), so the editing admin may only
	// change its roles here — see canManageAccount() in auth/accounts.ts. Its name section is replaced
	// with a note saying so.
	identityLocked?: boolean;
	// Where the "Send password reset" button posts (the form's own fields go with it, and are ignored).
	resetAction: string;
}

export function getEditUserForm(user: User, fields: Record<string, any>, action: string, flash: Record<string, string>, roleOptions: RoleOption[], selectedRoleIds: string[], options: EditUserFormOptions): FormSection {
	const nameSection: FieldConfig = options.identityLocked
		? {
			id: 'identity-locked-wrapper',
			name: 'identity-locked-wrapper',
			type: 'Html',
			markup: '<div class="p-6 bg-base-100 rounded-lg"><h2 class="text-lg font-medium">Name</h2><p class="mt-2 text-sm opacity-70">This account also has access to other sites, so its name can only be changed by its owner (from their profile) or by a super admin. You can still change its roles on this site.</p></div>',
		}
		: section('name', 'Edit first name + last name', fields, nameFields({ fname: flash.fname ?? user.fname, lname: flash.lname ?? user.lname }));

	return form([
		nameSection,
		...rolesSection(fields, roleOptions, selectedRoleIds),
		{
			id: 'password-reset-wrapper',
			name: 'password-reset-wrapper',
			type: 'Html',
			// formnovalidate: sending a reset doesn't need the rest of the form to be filled in.
			markup: `<div class="p-6 bg-base-100 rounded-lg flex flex-wrap items-center justify-between gap-4"><div><h2 class="text-lg font-medium">Password</h2><p class="mt-2 text-sm opacity-70">Email them a link to choose a new password. They stay signed in, and their current password keeps working, until they use it.</p></div><button type="submit" class="btn" formaction="${options.resetAction}" formnovalidate>Send password reset</button></div>`,
		},
	], action);
}
