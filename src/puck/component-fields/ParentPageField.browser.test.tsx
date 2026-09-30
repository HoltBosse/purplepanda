import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { parentPageField } from './ParentPageField';

const options = [
    { id: 'p-1', title: 'About', depth: 1 },
    { id: 'p-2', title: 'Team', depth: 2 },
    { id: 'p-3', title: 'Contact', depth: 1 },
];

/** The picker reads /admin/pages/api/parents; tests serve that from memory. */
function stubParents(totalPages = 1) {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input), 'http://localhost');
        const id = url.searchParams.get('id');
        if (id) {
            const match = options.find(o => o.id === id);
            return match
                ? new Response(JSON.stringify({ id, title: match.title }), { status: 200 })
                : new Response('{}', { status: 404 });
        }
        return new Response(JSON.stringify({ pages: options, totalPages }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

function renderField(value: string, excludeId?: string) {
    const field = parentPageField(excludeId);
    const Render = field.render as (props: any) => React.JSX.Element;
    const onChange = vi.fn();
    return {
        onChange,
        screen: render(<Render field={field} id="parent" name="parentPage" value={value} onChange={onChange} />),
    };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('parentPageField', () => {
    it('shows top level when empty and the parent title when set', async () => {
        stubParents();
        const empty = await renderField('').screen;
        expect(empty.container.textContent).toContain('None (top level)');

        const set = await renderField('p-3').screen;
        await expect.poll(() => set.container.querySelector('#parent')?.textContent).toBe('Contact');
    });

    it('lists pages with nesting and picks one', async () => {
        const fetchMock = stubParents();
        const { screen, onChange } = renderField('', 'self-id');
        const s = await screen;

        await s.getByRole('button', { name: 'Parent Page' }).click();
        await expect.poll(() => s.container.querySelectorAll('dialog li').length).toBe(4);
        expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain('exclude=self-id');
        // The nested row carries the same corner arrow as the pages admin list.
        const team = [...s.container.querySelectorAll('dialog li')].find(li => li.textContent?.includes('Team'));
        expect(team?.querySelector('svg')).not.toBeNull();

        await s.getByRole('button', { name: 'Team' }).click();
        expect(onChange).toHaveBeenCalledWith('p-2');
    });

    it('clears back to top level', async () => {
        stubParents();
        const { screen, onChange } = renderField('p-1');
        const s = await screen;

        await s.getByRole('button', { name: 'Clear parent page' }).click();
        expect(onChange).toHaveBeenCalledWith('');
    });

    it('paginates', async () => {
        const fetchMock = stubParents(2);
        const s = await renderField('').screen;

        await s.getByRole('button', { name: 'Parent Page' }).click();
        await expect.poll(() => s.container.textContent).toContain('Page 1 of 2');
        await s.getByRole('button', { name: 'Next' }).click();
        await expect.poll(() => String(fetchMock.mock.calls.at(-1)?.[0])).toContain('page=2');
    });
});
