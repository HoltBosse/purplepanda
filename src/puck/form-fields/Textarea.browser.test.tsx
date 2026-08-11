import type { PuckContext } from '@puckeditor/core';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import Textarea, { type TextareaProps } from './Textarea';

const fakePuck: PuckContext = {
    renderDropZone: () => null,
    metadata: {},
    isEditing: false,
    dragRef: null,
};

const baseProps: TextareaProps = {
    label: 'Comments',
    description: '',
    placeholder: '',
    rows: 4,
    required: false,
};

function renderTextarea(props: Partial<TextareaProps> = {}) {
    return render(<Textarea.render id="a" {...baseProps} {...props} puck={fakePuck} />);
}

describe('Textarea render', () => {
    it('renders a textarea wired to its label', async () => {
        const screen = await renderTextarea();

        await expect.element(screen.getByLabelText('Comments')).toBeInTheDocument();
    });

    it('accepts multi-line typed input', async () => {
        const screen = await renderTextarea();

        const textarea = screen.getByLabelText('Comments');
        await textarea.fill('line one\nline two');
        await expect.element(textarea).toHaveValue('line one\nline two');
    });

    it('applies the configured rows count', async () => {
        const screen = await renderTextarea({ rows: 8 });

        await expect.element(screen.getByLabelText('Comments')).toHaveAttribute('rows', '8');
    });

    it('marks the textarea required and shows a required marker when required', async () => {
        const screen = await renderTextarea({ required: true });

        await expect.element(screen.getByText('*')).toBeInTheDocument();
        // The required marker lives inside the <label>, so its accessible name is "Comments *".
        await expect.element(screen.getByLabelText(/Comments/)).toBeRequired();
    });

    it('renders the optional description when provided', async () => {
        const screen = await renderTextarea({ description: 'Keep it under 500 characters' });

        await expect.element(screen.getByText('Keep it under 500 characters')).toBeInTheDocument();
    });
});
