import type { PuckContext } from '@puckeditor/core';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import RadioGroup, { type RadioGroupProps } from './RadioGroup';

const fakePuck: PuckContext = {
    renderDropZone: () => null,
    metadata: {},
    isEditing: false,
    dragRef: null,
};

const baseProps: RadioGroupProps = {
    label: 'Preferred contact',
    description: '',
    options: [
        { label: 'Email', value: 'email' },
        { label: 'Phone', value: 'phone' },
        { label: 'Mail', value: 'mail' },
    ],
    required: false,
};

function renderRadioGroup(props: Partial<RadioGroupProps> = {}) {
    return render(<RadioGroup.render id="a" {...baseProps} {...props} puck={fakePuck} />);
}

describe('RadioGroup render', () => {
    it('renders one radio button per option, none selected initially', async () => {
        const screen = await renderRadioGroup();

        const radios = screen.container.querySelectorAll('input[type="radio"]');
        expect(radios).toHaveLength(baseProps.options.length);
        for (const option of baseProps.options) {
            await expect.element(screen.getByRole('radio', { name: option.label, exact: true })).not.toBeChecked();
        }
    });

    it('selecting one option deselects the others, since they share one native group', async () => {
        const screen = await renderRadioGroup();

        const email = screen.getByRole('radio', { name: 'Email', exact: true });
        const phone = screen.getByRole('radio', { name: 'Phone', exact: true });

        await email.click();
        await expect.element(email).toBeChecked();
        await expect.element(phone).not.toBeChecked();

        await phone.click();
        await expect.element(phone).toBeChecked();
        await expect.element(email).not.toBeChecked();
    });

    it('submits the option value rather than its label', async () => {
        const screen = await renderRadioGroup();

        await expect.element(screen.getByRole('radio', { name: 'Email', exact: true })).toHaveAttribute('value', 'email');
    });

    it('marks every radio required and shows a required marker when required', async () => {
        const screen = await renderRadioGroup({ required: true });

        await expect.element(screen.getByText('*')).toBeInTheDocument();
        for (const option of baseProps.options) {
            await expect.element(screen.getByRole('radio', { name: option.label, exact: true })).toBeRequired();
        }
    });

    it('renders the optional description when provided', async () => {
        const screen = await renderRadioGroup({ description: "We'll only use this for order updates" });

        await expect.element(screen.getByText("We'll only use this for order updates")).toBeInTheDocument();
    });

    it('renders no radios when the options list is empty', async () => {
        const screen = await renderRadioGroup({ options: [] });

        expect(screen.container.querySelectorAll('input[type="radio"]')).toHaveLength(0);
    });
});
