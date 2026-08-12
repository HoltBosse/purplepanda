import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { aliasField } from './AliasField';

const AliasFieldRender = aliasField.render as (props: {
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
            <AliasFieldRender field={{ label: 'Alias' }} id="alias-field" value={value} onChange={onChange} />,
        ),
    };
}

describe('aliasField', () => {
    it('renders its own label', async () => {
        const { screen } = renderField();
        const s = await screen;

        await expect.element(s.getByText('Alias')).toBeInTheDocument();
    });

    it('passes through lowercase letters and hyphens as-is', async () => {
        const { onChange, screen } = renderField();
        const s = await screen;

        await s.getByRole('textbox').fill('my-page-alias');

        expect(onChange).toHaveBeenLastCalledWith('my-page-alias');
    });

    it('lowercases uppercase letters', async () => {
        const { onChange, screen } = renderField();
        const s = await screen;

        await s.getByRole('textbox').fill('MyPage');

        expect(onChange).toHaveBeenLastCalledWith('mypage');
    });

    it('strips characters that are not a-z or a hyphen', async () => {
        const { onChange, screen } = renderField();
        const s = await screen;

        await s.getByRole('textbox').fill('my page_alias!123');

        expect(onChange).toHaveBeenLastCalledWith('mypagealias');
    });
});
