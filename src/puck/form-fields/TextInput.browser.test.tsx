import type { PuckContext } from '@puckeditor/core';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import TextInput, { type TextInputProps } from './TextInput';

const fakePuck: PuckContext = {
    renderDropZone: () => null,
    metadata: {},
    isEditing: false,
    dragRef: null,
};

const baseProps: TextInputProps = {
    label: 'Full name',
    description: '',
    inputType: 'text',
    placeholder: '',
    required: false,
};

function renderInput(props: Partial<TextInputProps> = {}) {
    return render(<TextInput.render id="a" {...baseProps} {...props} puck={fakePuck} />);
}

describe('TextInput render', () => {
    it('renders an input wired to its label', async () => {
        const screen = await renderInput();

        await expect.element(screen.getByLabelText('Full name')).toBeInTheDocument();
    });

    it('accepts typed input', async () => {
        const screen = await renderInput();

        const input = screen.getByLabelText('Full name');
        await input.fill('Ada Lovelace');
        await expect.element(input).toHaveValue('Ada Lovelace');
    });

    it('renders the placeholder text', async () => {
        const screen = await renderInput({ placeholder: 'Jane Doe' });

        await expect.element(screen.getByPlaceholder('Jane Doe')).toBeInTheDocument();
    });

    it.each(['text', 'email', 'number', 'tel', 'url', 'date'] as const)(
        'renders inputType %s as the type attribute',
        async (inputType) => {
            const screen = await renderInput({ inputType });

            await expect.element(screen.getByLabelText('Full name')).toHaveAttribute('type', inputType);
        },
    );

    it('renders a password input, which has no accessible textbox role', async () => {
        const screen = await renderInput({ inputType: 'password' });

        expect(screen.container.querySelector('input[type="password"]')).not.toBeNull();
    });

    it('marks the input required and shows a required marker when required', async () => {
        const screen = await renderInput({ required: true });

        await expect.element(screen.getByText('*')).toBeInTheDocument();
        // The required marker lives inside the <label>, so its accessible name is "Full name *".
        await expect.element(screen.getByLabelText(/Full name/)).toBeRequired();
    });

    it('renders the optional description when provided', async () => {
        const screen = await renderInput({ description: 'As it appears on your ID' });

        await expect.element(screen.getByText('As it appears on your ID')).toBeInTheDocument();
    });
});
