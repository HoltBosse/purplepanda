import { describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { render } from 'vitest-browser-react';
import SearchBar from './SearchBar';
import type { SearchFieldSpec } from './types';

const fields: SearchFieldSpec[] = [
    { name: 'author', type: 'text', label: 'Author' },
    { name: 'state', type: 'enum', enumValues: ['enabled', 'disabled'] },
    { name: 'active', type: 'boolean' },
];

function renderBar(props: Partial<React.ComponentProps<typeof SearchBar>> = {}) {
    return render(<SearchBar fields={fields} {...props} />);
}

const input = (screen: Awaited<ReturnType<typeof renderBar>>) => screen.getByRole('textbox');

describe('SearchBar markup', () => {
    // The form works without JS: a plain GET submits ?q=... which the server parses the same way.
    it('submits as a GET form so search works without JavaScript', async () => {
        const screen = await renderBar();

        const form = screen.container.querySelector('form');
        expect(form?.getAttribute('method')?.toUpperCase()).toBe('GET');
    });

    it('names the input so the query lands in the expected param', async () => {
        const screen = await renderBar();

        expect(screen.container.querySelector('input[name="q"]')).not.toBeNull();
    });

    it('honours a custom param name', async () => {
        const screen = await renderBar({ name: 'search' });

        expect(screen.container.querySelector('input[name="search"]')).not.toBeNull();
    });

    it('starts from the provided default value', async () => {
        const screen = await renderBar({ defaultValue: 'author:jane' });

        await expect.element(input(screen)).toHaveValue('author:jane');
    });

    it('keeps the placeholder on the real input for screen readers', async () => {
        const screen = await renderBar({ placeholder: 'Find documents' });

        expect(screen.container.querySelector('input')?.placeholder).toBe('Find documents');
    });

    it('hides the decorative highlight layer from assistive tech', async () => {
        const screen = await renderBar({ defaultValue: 'author:jane' });

        expect(screen.container.querySelector('[aria-hidden="true"]')).not.toBeNull();
    });
});

describe('SearchBar highlighting', () => {
    it('marks a recognized qualifier as valid', async () => {
        const screen = await renderBar({ defaultValue: 'author:jane' });

        expect(screen.container.querySelector('.text-success')).not.toBeNull();
    });

    it('marks an unrecognized qualifier as invalid', async () => {
        const screen = await renderBar({ defaultValue: 'bogus:jane' });

        expect(screen.container.querySelector('.text-error')).not.toBeNull();
    });

    it('leaves plain text terms unstyled', async () => {
        const screen = await renderBar({ defaultValue: 'hello' });

        expect(screen.container.querySelector('.text-success')).toBeNull();
        expect(screen.container.querySelector('.text-error')).toBeNull();
    });

    // The colored backdrop must mirror the input's text exactly or the two layers drift apart.
    it('reproduces the query text verbatim in the backdrop layer', async () => {
        const screen = await renderBar({ defaultValue: 'author:jane extra' });

        const backdrop = screen.container.querySelector('[aria-hidden="true"] .whitespace-pre');
        expect(backdrop?.textContent).toBe('author:jane extra');
    });
});

describe('SearchBar clear button', () => {
    it('is hidden while the query is empty', async () => {
        const screen = await renderBar();

        expect(screen.container.querySelector('[aria-label="Clear search"]')).toBeNull();
    });

    it('appears once there is a query', async () => {
        const screen = await renderBar({ defaultValue: 'author:jane' });

        await expect.element(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument();
    });

    it('empties the query when clicked', async () => {
        const screen = await renderBar({ defaultValue: 'author:jane' });

        await screen.getByRole('button', { name: 'Clear search' }).click();

        await expect.element(input(screen)).toHaveValue('');
    });
});

describe('SearchBar autocomplete', () => {
    it('suggests matching field names as you type', async () => {
        const screen = await renderBar();

        await input(screen).fill('a');

        await expect.element(screen.getByText('author:')).toBeInTheDocument();
    });

    it('shows a field label alongside the qualifier', async () => {
        const screen = await renderBar();

        await input(screen).fill('a');

        await expect.element(screen.getByText('Author', { exact: true })).toBeInTheDocument();
    });

    it('completes the qualifier when a suggestion is clicked', async () => {
        const screen = await renderBar();

        await input(screen).fill('auth');
        await screen.getByText('author:').click();

        await expect.element(input(screen)).toHaveValue('author:');
    });

    it('suggests that field\'s values once the qualifier is complete', async () => {
        const screen = await renderBar();

        await input(screen).fill('state:');

        await expect.element(screen.getByText('state:enabled')).toBeInTheDocument();
    });

    it('inserts a chosen value and a trailing space, ready for the next term', async () => {
        const screen = await renderBar();

        await input(screen).fill('state:');
        await screen.getByText('state:enabled').click();

        await expect.element(input(screen)).toHaveValue('state:enabled ');
    });

    it('offers no suggestions for an unrecognized qualifier', async () => {
        const screen = await renderBar();

        await input(screen).fill('bogus:');

        expect(screen.container.querySelector('ul.menu')).toBeNull();
    });

    it('closes the dropdown on Escape', async () => {
        const screen = await renderBar();

        await input(screen).fill('a');
        expect(screen.container.querySelector('ul.menu')).not.toBeNull();

        await input(screen).click();
        await userEvent.keyboard('{Escape}');

        await expect.poll(() => screen.container.querySelector('ul.menu')).toBeNull();
    });

    // Enter must submit the query as typed unless the user explicitly arrowed onto a suggestion.
    it('highlights a suggestion only after arrowing to it', async () => {
        const screen = await renderBar();

        await input(screen).fill('a');
        expect(screen.container.querySelector('ul.menu .active')).toBeNull();

        await input(screen).click();
        await userEvent.keyboard('{ArrowDown}');

        await expect.poll(() => screen.container.querySelector('ul.menu .active')).not.toBeNull();
    });

    it('applies the highlighted suggestion on Enter', async () => {
        const screen = await renderBar();

        await input(screen).fill('auth');
        await input(screen).click();
        await userEvent.keyboard('{ArrowDown}');
        await userEvent.keyboard('{Enter}');

        await expect.element(input(screen)).toHaveValue('author:');
    });

    it('wraps around when arrowing past the end of the list', async () => {
        const screen = await renderBar();

        await input(screen).fill('');
        await input(screen).click();
        await userEvent.keyboard('{ArrowUp}');

        // ArrowUp from nothing-selected wraps to the last suggestion.
        await expect.poll(() => screen.container.querySelectorAll('ul.menu .active').length).toBe(1);
    });
});
