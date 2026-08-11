import type React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import FormEmbed, { type FormEmbedProps, type FormRef } from './FormEmbed';

const FormEmbedRender = FormEmbed.render as (props: FormEmbedProps) => React.JSX.Element;

const formField = FormEmbed.fields?.form as {
    mapRow: (item: FormRef) => Record<string, string>;
    getItemSummary: (item: FormRef | null) => string;
};

describe('FormEmbed render', () => {
    it('renders the server-rendered form markup when it is available', async () => {
        const screen = await render(
            <FormEmbedRender form={{ id: '1', name: 'Contact' }} _html='<p id="real-form">real form</p>' />,
        );

        expect(screen.container.querySelector('#real-form')?.textContent).toBe('real form');
    });

    it('keeps the embed full-width so an island hydrating inside cannot collapse it', async () => {
        const screen = await render(<FormEmbedRender form={null} _html="<p>form</p>" />);

        expect(screen.container.firstElementChild?.className).toContain('w-full');
    });

    it('falls back to naming the selected form when no markup has been resolved yet', async () => {
        const screen = await render(<FormEmbedRender form={{ id: '1', name: 'Contact' }} />);

        await expect.element(screen.getByText('Form: Contact')).toBeInTheDocument();
    });

    it('prompts the author when no form has been selected', async () => {
        const screen = await render(<FormEmbedRender form={null} />);

        await expect.element(screen.getByText('No form selected')).toBeInTheDocument();
    });
});

describe('FormEmbed form field', () => {
    it('lists forms by name', () => {
        expect(formField.mapRow({ id: '1', name: 'Contact' })).toEqual({ Name: 'Contact' });
    });

    it('falls back to the id when a form has no name', () => {
        expect(formField.mapRow({ id: 'abc', name: '' })).toEqual({ Name: 'abc' });
    });

    it('falls back to "Untitled" when a form has neither name nor id', () => {
        expect(formField.mapRow({ id: '', name: '' })).toEqual({ Name: 'Untitled' });
    });

    it('summarises the selected form by name, id, then "Untitled"', () => {
        expect(formField.getItemSummary({ id: '1', name: 'Contact' })).toBe('Contact');
        expect(formField.getItemSummary({ id: 'abc', name: '' })).toBe('abc');
        expect(formField.getItemSummary({ id: '', name: '' })).toBe('Untitled');
    });

    it('summarises an empty selection as "Untitled"', () => {
        expect(formField.getItemSummary(null)).toBe('Untitled');
    });
});
