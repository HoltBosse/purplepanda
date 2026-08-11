import type { PuckContext } from '@puckeditor/core';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import Checkbox, { type CheckboxProps } from './Checkbox';

const fakePuck: PuckContext = {
    renderDropZone: () => null,
    metadata: {},
    isEditing: false,
    dragRef: null,
};

const baseProps: CheckboxProps = {
    label: 'Consent',
    description: '',
    checkboxLabel: 'I agree',
    required: false,
};

function renderCheckbox(props: Partial<CheckboxProps> = {}) {
    return render(<Checkbox.render id="a" {...baseProps} {...props} puck={fakePuck} />);
}

describe('Checkbox render', () => {
    it('renders the checkbox label and starts unchecked', async () => {
        const screen = await renderCheckbox();

        await expect.element(screen.getByRole('checkbox', { name: 'I agree' })).not.toBeChecked();
    });

    it('toggles checked state when clicked', async () => {
        const screen = await renderCheckbox();

        const checkbox = screen.getByRole('checkbox', { name: 'I agree' });
        await checkbox.click();
        await expect.element(checkbox).toBeChecked();

        await checkbox.click();
        await expect.element(checkbox).not.toBeChecked();
    });

    it('shows a required marker next to the label when required', async () => {
        const screen = await renderCheckbox({ required: true });

        await expect.element(screen.getByText('*')).toBeInTheDocument();
        await expect.element(screen.getByRole('checkbox', { name: 'I agree' })).toBeRequired();
    });

    it('renders the optional description when provided', async () => {
        const screen = await renderCheckbox({ description: 'You must be 18+' });

        await expect.element(screen.getByText('You must be 18+')).toBeInTheDocument();
    });

    it('omits the description entirely when it is blank', async () => {
        const screen = await renderCheckbox();

        expect(screen.container.querySelector('p.text-base-content\\/60')).toBeNull();
    });
});
