import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { dateTimeField } from './DateTimeField';

const DateTimeFieldRender = dateTimeField.render as (props: {
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
            <DateTimeFieldRender field={{ label: 'Publish at' }} id="datetime-field" value={value} onChange={onChange} />,
        ),
    };
}

describe('dateTimeField', () => {
    it('is registered as a custom Puck field', () => {
        expect(dateTimeField.type).toBe('custom');
        expect(dateTimeField.label).toBe('Date/Time');
    });

    it('renders its own label', async () => {
        const { screen } = renderField();
        const s = await screen;

        await expect.element(s.getByText('Publish at')).toBeInTheDocument();
    });

    it('submits the picked local time as a UTC ISO string, not the raw local value', async () => {
        const { onChange, screen } = renderField();
        const s = await screen;

        const picked = '2024-06-15T14:30';
        await s.getByLabelText('Publish at').fill(picked);

        const submitted = onChange.mock.calls.at(-1)?.[0] as string;
        // The submitted value must be the UTC equivalent of the local wall-clock time the user
        // picked, expressed as a real ISO timestamp — never the timezone-naive local string as-is.
        expect(submitted).toBe(new Date(picked).toISOString());
        expect(submitted).not.toBe(picked);
        expect(submitted.endsWith('Z')).toBe(true);
    });

    it('displays a stored UTC timestamp converted to local wall-clock time, not the raw UTC string', async () => {
        const storedUtc = new Date('2024-06-15T14:30:00.000Z');
        const { screen } = renderField(storedUtc.toISOString());
        const s = await screen;

        const pad = (n: number) => String(n).padStart(2, '0');
        const expectedLocal = `${storedUtc.getFullYear()}-${pad(storedUtc.getMonth() + 1)}-${pad(storedUtc.getDate())}T${pad(storedUtc.getHours())}:${pad(storedUtc.getMinutes())}`;

        await expect.element(s.getByLabelText('Publish at')).toHaveValue(expectedLocal);
    });

    it('treats an empty value as an empty string in both directions', async () => {
        const { screen } = renderField(undefined);
        const s = await screen;

        await expect.element(s.getByLabelText('Publish at')).toHaveValue('');
    });

    it('hides the clear button when there is no value', async () => {
        const { screen } = renderField(undefined);
        const s = await screen;

        await expect.element(s.getByRole('button', { name: 'Clear date/time' })).not.toBeInTheDocument();
    });

    it('shows a clear button when a value is set, and clears the value on click', async () => {
        const { onChange, screen } = renderField(new Date('2024-06-15T14:30:00.000Z').toISOString());
        const s = await screen;

        const clearButton = s.getByRole('button', { name: 'Clear date/time' });
        await expect.element(clearButton).toBeInTheDocument();
        await clearButton.click();

        expect(onChange).toHaveBeenLastCalledWith('');
    });
});
