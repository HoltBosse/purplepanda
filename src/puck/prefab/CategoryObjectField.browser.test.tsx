import type { Field } from '@puckeditor/core';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { CategoryObjectField, categoryField } from './CategoryObjectField';

// AutoField pulls in the full Puck app store context, which this test has no interest in
// standing up. Swap it for a plain input so the tests below can focus on CategoryObjectField's
// own behavior: the expand/collapse chrome, the spread-and-patch onChange merge, and (critically)
// which props it forwards to AutoField — see the "never passes a name prop" test below for why
// that last one matters. Sub-fields are keyed off `field.label` here since that's the only thing
// distinguishing them once `name` is out of the picture, same as real production usage.
vi.mock('@puckeditor/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@puckeditor/core')>();
    return {
        ...actual,
        AutoField: (props: {
            field: { label?: string };
            value: string | undefined;
            onChange: (value: string) => void;
            name?: string;
        }) => (
            <input
                aria-label={props.field.label}
                data-name-prop={props.name ?? ''}
                value={props.value ?? ''}
                onChange={(e) => props.onChange(e.target.value)}
            />
        ),
    };
});

const objectFields: Record<string, Field> = {
    title: { type: 'text', label: 'Title' },
    subtitle: { type: 'text', label: 'Subtitle' },
};

function renderField(value: Record<string, any> | undefined = undefined, readOnly = false) {
    const onChange = vi.fn();
    return {
        onChange,
        render: render(
            <CategoryObjectField
                field={{ label: 'SEO', objectFields }}
                value={value}
                onChange={onChange}
                readOnly={readOnly}
            />,
        ),
    };
}

describe('CategoryObjectField', () => {
    it('renders the category label as its header, defaulting to "Group" when unset', async () => {
        const withLabel = await render(
            <CategoryObjectField field={{ label: 'SEO', objectFields }} value={undefined} onChange={vi.fn()} />,
        );
        await expect.element(withLabel.getByText('SEO')).toBeInTheDocument();

        const withoutLabel = await render(
            <CategoryObjectField field={{ objectFields }} value={undefined} onChange={vi.fn()} />,
        );
        await expect.element(withoutLabel.getByText('Group')).toBeInTheDocument();
    });

    it('is expanded by default, showing one labeled row per sub-field', async () => {
        const { render: screen } = renderField();
        const s = await screen;

        await expect.element(s.getByText('Title', { exact: true })).toBeInTheDocument();
        await expect.element(s.getByText('Subtitle')).toBeInTheDocument();
        await expect.element(s.getByLabelText('Title', { exact: true })).toBeInTheDocument();
        await expect.element(s.getByLabelText('Subtitle')).toBeInTheDocument();
    });

    it('falls back to the sub-field key as its label when the sub-field has none', async () => {
        const fields: Record<string, Field> = { tagline: { type: 'text' } };
        const s = await render(
            <CategoryObjectField field={{ label: 'SEO', objectFields: fields }} value={undefined} onChange={vi.fn()} />,
        );

        await expect.element(s.getByText('tagline')).toBeInTheDocument();
    });

    it('starts collapsed when field.defaultExpanded is false', async () => {
        const s = await render(
            <CategoryObjectField
                field={{ label: 'SEO', objectFields, defaultExpanded: false }}
                value={undefined}
                onChange={vi.fn()}
            />,
        );

        await expect.element(s.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
        await expect.element(s.getByLabelText('Title', { exact: true })).not.toBeInTheDocument();
    });

    it('toggles sub-fields on header click, tracked via aria-expanded', async () => {
        const { render: screen } = renderField();
        const s = await screen;
        const header = s.getByRole('button');

        await expect.element(header).toHaveAttribute('aria-expanded', 'true');

        await header.click();
        await expect.element(header).toHaveAttribute('aria-expanded', 'false');
        await expect.element(s.getByLabelText('Title', { exact: true })).not.toBeInTheDocument();

        await header.click();
        await expect.element(header).toHaveAttribute('aria-expanded', 'true');
        await expect.element(s.getByLabelText('Title', { exact: true })).toBeInTheDocument();
    });

    it('patches only the changed key onto a spread of the previous value', async () => {
        const { onChange, render: screen } = renderField({ title: 'Hello', subtitle: 'World' });
        const s = await screen;

        await s.getByLabelText('Subtitle').fill('Universe');

        expect(onChange).toHaveBeenLastCalledWith({ title: 'Hello', subtitle: 'Universe' });
    });

    it('treats an unset value as an empty object when patching', async () => {
        const { onChange, render: screen } = renderField(undefined);
        const s = await screen;

        await s.getByLabelText('Title', { exact: true }).fill('Hi');

        expect(onChange).toHaveBeenLastCalledWith({ title: 'Hi' });
    });

    it('skips onChange when a sub-field reports its already-current value', async () => {
        const { onChange, render: screen } = renderField({ title: 'Hello' });
        const s = await screen;

        await s.getByLabelText('Title', { exact: true }).fill('Hello');

        expect(onChange).not.toHaveBeenCalled();
    });

    it('disables the sub-fields fieldset when readOnly', async () => {
        const { render: screen } = renderField({}, true);
        const s = await screen;

        await expect.element(s.getByLabelText('Title', { exact: true })).toBeDisabled();
    });

    // Regression test: the public AutoField seeds its own field-value store keyed by a freshly
    // generated id, and reads a sub-field's displayed value back out of that store by `name`
    // (falling back to that same id when `name` is unset). A previous version of this component
    // passed `name={subName}` (e.g. "title") to preserve Puck's outline "focus this field"
    // path-tracking — but that name doesn't match the id the value was actually seeded under, so
    // the lookup missed and the field rendered blank on every remount (e.g. selecting a different
    // component in the canvas and coming back), even though the real saved value was untouched.
    it('never passes a name prop to AutoField', async () => {
        const { render: screen } = renderField({ title: 'Hello' });
        const s = await screen;

        await expect.element(s.getByLabelText('Title', { exact: true })).toHaveAttribute('data-name-prop', '');
    });
});

describe('categoryField', () => {
    it('builds a custom field whose render passes through the given label and objectFields', async () => {
        const field = categoryField('SEO', objectFields);
        expect(field.type).toBe('custom');
        expect(field.label).toBe('SEO');
        expect(field.objectFields).toBe(objectFields);

        const Render = field.render as (props: any) => React.JSX.Element;
        const s = await render(<Render value={undefined} onChange={vi.fn()} />);

        await expect.element(s.getByText('SEO')).toBeInTheDocument();
        await expect.element(s.getByText('Title', { exact: true })).toBeInTheDocument();
    });

    it('defaults to expanded when no options are given', async () => {
        const field = categoryField('SEO', objectFields);
        expect(field.defaultExpanded).toBe(true);

        const Render = field.render as (props: any) => React.JSX.Element;
        const s = await render(<Render value={undefined} onChange={vi.fn()} />);

        await expect.element(s.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
    });

    it('starts collapsed when defaultExpanded: false is passed', async () => {
        const field = categoryField('Open Graph', objectFields, { defaultExpanded: false });
        expect(field.defaultExpanded).toBe(false);

        const Render = field.render as (props: any) => React.JSX.Element;
        const s = await render(<Render value={undefined} onChange={vi.fn()} />);

        await expect.element(s.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
        await expect.element(s.getByLabelText('Title', { exact: true })).not.toBeInTheDocument();
    });
});
