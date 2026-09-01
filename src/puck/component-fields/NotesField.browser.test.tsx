import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { notesField } from './NotesField';

const NotesFieldRender = notesField.render as (props: {
    field: { label?: string };
    id: string;
    value: string | undefined;
    onChange: (value: string) => void;
}) => React.JSX.Element;

function renderField(value: string | undefined = '') {
    const onChange = vi.fn();
    return {
        onChange,
        screen: render(
            <NotesFieldRender field={{ label: 'Notes' }} id="notes-field" value={value} onChange={onChange} />,
        ),
    };
}

describe('notesField', () => {
    it('renders its own label', async () => {
        const { screen } = renderField();
        const s = await screen;

        await expect.element(s.getByText('Notes')).toBeInTheDocument();
    });

    it('shows a running character count against the 256 limit', async () => {
        const { screen } = renderField('hello');
        const s = await screen;

        await expect.element(s.getByText('5/256')).toBeInTheDocument();
    });

    it('caps input at 256 characters via maxLength', async () => {
        const { screen } = renderField();
        const s = await screen;

        const textarea = s.getByRole('textbox').element() as HTMLTextAreaElement;
        expect(textarea.maxLength).toBe(256);
    });

    it('passes typed text through to onChange', async () => {
        const { onChange, screen } = renderField();
        const s = await screen;

        await s.getByRole('textbox').fill('some notes');

        expect(onChange).toHaveBeenLastCalledWith('some notes');
    });
});
