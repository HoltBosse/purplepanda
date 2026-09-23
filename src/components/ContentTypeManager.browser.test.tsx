// The builder enforces contentTypeInputSchema's rules through the browser's own constraint
// validation, so a bad field name is reported on the input rather than coming back as an alert
// from the server. These assert what the browser itself decides — checkValidity/validationMessage
// on the real inputs — which is the part that can't be reviewed by reading the props.
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import type { ContentTypeRecord } from '../puck/content-types';
import ContentTypeManager from './ContentTypeManager';

const existing: ContentTypeRecord[] = [
    {
        id: '61518547-b321-4b88-aea7-a235acdc4619',
        title: 'Article',
        baseUrl: 'articles',
        fields: [{ name: 'description', label: 'Description', type: 'text' }],
        jsonLd: { type: 'Article', properties: { headline: 'title' } },
    },
];

async function openBuilder() {
    const screen = await render(<ContentTypeManager contentTypes={existing} itemCounts={{}} actionBase="/admin/settings/content-types" />);
    await screen.getByRole('button', { name: 'New content type' }).click();
    return screen;
}

function input(container: HTMLElement, placeholder: string): HTMLInputElement {
    const found = container.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`);
    if (!found) throw new Error(`no input with placeholder "${placeholder}"`);
    return found;
}

function select(container: HTMLElement, label: string): HTMLSelectElement | null {
    return container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);
}

function optionValues(element: HTMLSelectElement): string[] {
    return [...element.options].map((option) => option.value);
}

describe('ContentTypeManager', () => {
    it('lists the content types that already exist', async () => {
        const screen = await render(<ContentTypeManager contentTypes={existing} itemCounts={{}} actionBase="/admin/settings/content-types" />);

        await expect.element(screen.getByRole('link', { name: 'Article' })).toBeInTheDocument();
    });

    it('accepts a field whose name is a plain identifier', async () => {
        const screen = await openBuilder();

        await screen.getByPlaceholder('Description', { exact: true }).fill('Short summary');

        expect(input(screen.container, 'description').value).toBe('short_summary');
        expect(input(screen.container, 'description').checkValidity()).toBe(true);
    });

    it('filters a field name down to what can be a prop name as it is typed', async () => {
        const screen = await openBuilder();

        await screen.getByPlaceholder('Description', { exact: true }).fill('Summary');
        await screen.getByPlaceholder('description', { exact: true }).fill('2 words, with punctuation!');

        const name = input(screen.container, 'description');
        expect(name.value).toBe('words_with_punctuation');
        expect(name.checkValidity()).toBe(true);
    });

    it('rejects a field name the editor reserves', async () => {
        const screen = await openBuilder();

        await screen.getByPlaceholder('Description', { exact: true }).fill('Title');

        const name = input(screen.container, 'description');
        expect(name.checkValidity()).toBe(false);
        expect(name.validationMessage).toBe('"title" is a reserved field name');
    });

    it('rejects a second field reusing a name', async () => {
        const screen = await openBuilder();

        await screen.getByPlaceholder('Description', { exact: true }).first().fill('Summary');
        await screen.getByRole('button', { name: 'Add field' }).click();
        await screen.getByPlaceholder('Description', { exact: true }).nth(1).fill('Summary');

        const [, secondName] = screen.container.querySelectorAll<HTMLInputElement>('input[placeholder="description"]');
        if (!secondName) throw new Error('second field row not rendered');

        expect(secondName.checkValidity()).toBe(false);
        expect(secondName.validationMessage).toBe('Another field already uses the name "summary"');
    });

    it('filters a base URL down to a path as it is typed', async () => {
        const screen = await openBuilder();

        await screen.getByPlaceholder('/articles', { exact: true }).fill('/News Articles?x=1');

        const baseUrl = input(screen.container, '/articles');
        expect(baseUrl.value).toBe('/news-articlesx1');
        expect(baseUrl.checkValidity()).toBe(true);
    });

    it('offers the properties of whichever schema.org type is picked', async () => {
        const screen = await openBuilder();

        await screen.getByLabelText('Type', { exact: true }).selectOptions('Recipe');
        await screen.getByRole('button', { name: 'Add property' }).click();

        const property = select(screen.container, 'Structured data property 1');
        if (!property) throw new Error('no property select rendered');
        expect(optionValues(property)).toContain('recipeIngredient');
        expect(optionValues(property)).not.toContain('jobLocation');
        // Every type's own properties are followed by the ones they all share.
        expect(optionValues(property)).toContain('description');
    });

    it('leaves out a property another row already maps', async () => {
        const screen = await openBuilder();

        await screen.getByLabelText('Type', { exact: true }).selectOptions('Article');
        await screen.getByRole('button', { name: 'Add property' }).click();
        await screen.getByRole('button', { name: 'Add property' }).click();

        await screen.getByLabelText('Structured data property 1', { exact: true }).selectOptions('headline');

        const first = select(screen.container, 'Structured data property 1');
        const second = select(screen.container, 'Structured data property 2');
        if (!first || !second) throw new Error('two property selects expected');
        expect(optionValues(first)).toContain('headline');
        expect(optionValues(second)).not.toContain('headline');
    });

    it('drops the mappings made against a type when a different one is picked', async () => {
        const screen = await openBuilder();

        await screen.getByLabelText('Type', { exact: true }).selectOptions('Article');
        await screen.getByRole('button', { name: 'Add property' }).click();
        await screen.getByLabelText('Type', { exact: true }).selectOptions('Product');

        expect(select(screen.container, 'Structured data property 1')).toBeNull();
        expect(screen.container.querySelector<HTMLInputElement>('input[name="jsonld"]')?.value).toBe(
            '{"type":"Product","properties":{}}',
        );
    });

    it('loads a saved content type into the builder to edit it', async () => {
        const screen = await render(
            <ContentTypeManager contentTypes={existing} itemCounts={{}} actionBase="/admin/settings/content-types" />,
        );

        await screen.getByRole('button', { name: 'Edit Article' }).click();

        const form = screen.container.querySelector('form');
        expect(form?.getAttribute('action')).toBe(`/admin/settings/content-types/update/${existing[0]?.id}`);
        expect(input(screen.container, 'Article').value).toBe('Article');
        expect(input(screen.container, '/articles').value).toBe('/articles');
        await expect.element(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();

        // The saved field, plus the usual empty row to add another.
        const name = screen.container.querySelector<HTMLInputElement>('input[aria-label="Field 1 name"]');
        expect(name?.value).toBe('description');
        expect(name?.disabled).toBe(true);
        expect(screen.container.querySelector<HTMLInputElement>('input[name="fields"]')?.value).toBe(
            JSON.stringify(existing[0]?.fields),
        );
        expect(screen.container.querySelector<HTMLInputElement>('input[name="jsonld"]')?.value).toBe(
            JSON.stringify(existing[0]?.jsonLd),
        );
    });

    it("keeps a saved field's name when its label is edited", async () => {
        const screen = await render(
            <ContentTypeManager contentTypes={existing} itemCounts={{}} actionBase="/admin/settings/content-types" />,
        );

        await screen.getByRole('button', { name: 'Edit Article' }).click();
        await screen.getByLabelText('Field 1 label', { exact: true }).fill('Summary');

        // Renaming the prop would orphan the value every item already stores under it.
        expect(screen.container.querySelector<HTMLInputElement>('input[name="fields"]')?.value).toBe(
            JSON.stringify([{ name: 'description', label: 'Summary', type: 'text' }]),
        );
    });

    it('confirms a delete, saying how many items go with it', async () => {
        const id = existing[0]?.id ?? '';
        const screen = await render(
            <ContentTypeManager contentTypes={existing} itemCounts={{ [id]: 3 }} actionBase="/admin/settings/content-types" />,
        );

        await screen.getByRole('button', { name: 'Delete Article' }).click();

        const dialog = screen.container.querySelector('dialog');
        expect(dialog?.open).toBe(true);
        expect(dialog?.textContent).toContain('Its 3 items will disappear from the admin and stop being published.');
        expect(dialog?.querySelector('form[method="POST"]')?.getAttribute('action')).toBe(
            `/admin/settings/content-types/delete/${id}`,
        );

        await screen.getByRole('button', { name: 'Cancel' }).click();
        expect(dialog?.open).toBe(false);
    });

    it('leaves a blank field row out of what gets submitted', async () => {
        const screen = await openBuilder();

        const serialized = screen.container.querySelector<HTMLInputElement>('input[name="fields"]');
        expect(serialized?.value).toBe('[]');
        expect(input(screen.container, 'Description').checkValidity()).toBe(true);
    });
});
