import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { folderField, type MediaFolderRef } from './FolderPicker';

const FolderPickerRender = folderField.render as (props: {
    value: MediaFolderRef | null;
    onChange: (value: MediaFolderRef | null) => void;
}) => React.JSX.Element;

const subfolders: MediaFolderRef[] = [
    { id: 'f1', name: 'Uploads', visibility: 1 },
    { id: 'f2', name: 'Private', visibility: -1 },
];

/** The picker lists folders from /admin/media/api/lookup; tests serve that from memory. */
function stubLookup(folders: MediaFolderRef[] = subfolders) {
    const fetchMock = vi.fn(
        async (_input: RequestInfo | URL, _init?: RequestInit) =>
            new Response(JSON.stringify({ folders }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

function renderPicker(value: MediaFolderRef | null = null) {
    const onChange = vi.fn();
    return { onChange, screen: render(<FolderPickerRender value={value} onChange={onChange} />) };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('folderField closed state', () => {
    it('prompts for a selection when nothing is chosen', async () => {
        const { screen } = renderPicker();
        const s = await screen;

        await expect.element(s.getByText('Select a folder...')).toBeInTheDocument();
    });

    it('shows the chosen folder name once selected', async () => {
        const { screen } = renderPicker({ id: 'f1', name: 'Uploads', visibility: 1 });
        const s = await screen;

        await expect.element(s.getByText('Uploads')).toBeInTheDocument();
    });

    // The field has no Puck-level required option, so it surfaces the requirement itself.
    it('flags the empty state as an error, since a folder is required', async () => {
        const { screen } = renderPicker();
        const s = await screen;

        await expect.element(s.getByText('A destination folder is required.')).toBeInTheDocument();
    });

    it('drops the error once a folder is chosen', async () => {
        const { screen } = renderPicker({ id: 'f1', name: 'Uploads', visibility: 1 });
        const s = await screen;

        expect(s.container.textContent).not.toContain('A destination folder is required.');
    });

    it('recommends a hidden folder for privacy', async () => {
        const { screen } = renderPicker();
        const s = await screen;

        expect(s.container.textContent).toContain('hidden');
    });

    it('badges a selected hidden folder', async () => {
        const { screen } = renderPicker({ id: 'f2', name: 'Private', visibility: -1 });
        const s = await screen;

        // Exact: the privacy note below the button also mentions "hidden".
        await expect.element(s.getByText('Hidden', { exact: true })).toBeInTheDocument();
    });
});

describe('folderField dialog', () => {
    it('loads subfolders from the media lookup endpoint when opened', async () => {
        const fetchMock = stubLookup();
        const { screen } = renderPicker();
        const s = await screen;

        await s.getByRole('button', { name: /Select a folder/ }).click();

        await expect.poll(() => fetchMock.mock.calls.length).toBeGreaterThan(0);
        expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/admin/media/api/lookup');
    });

    it('requests only folders, including hidden ones', async () => {
        const fetchMock = stubLookup();
        const { screen } = renderPicker();
        const s = await screen;

        await s.getByRole('button', { name: /Select a folder/ }).click();
        await expect.poll(() => fetchMock.mock.calls.length).toBeGreaterThan(0);

        const url = String(fetchMock.mock.calls[0]?.[0]);
        expect(url).toContain('foldersOnly=1');
        expect(url).toContain('includeHidden=1');
    });

    it('lists the returned folders', async () => {
        stubLookup();
        const { screen } = renderPicker();
        const s = await screen;

        await s.getByRole('button', { name: /Select a folder/ }).click();

        await expect.element(s.getByText('Uploads')).toBeInTheDocument();
        await expect.element(s.getByText('Private')).toBeInTheDocument();
    });

    it('reports an empty folder listing rather than showing a blank pane', async () => {
        stubLookup([]);
        const { screen } = renderPicker();
        const s = await screen;

        await s.getByRole('button', { name: /Select a folder/ }).click();

        await expect.element(s.getByText('No subfolders')).toBeInTheDocument();
    });

    it('cannot confirm while still at the root, which is not a real folder', async () => {
        stubLookup();
        const { screen } = renderPicker();
        const s = await screen;

        await s.getByRole('button', { name: /Select a folder/ }).click();

        await expect.element(s.getByRole('button', { name: 'Select current folder' })).toBeDisabled();
    });

    it('confirms the folder the user has navigated into', async () => {
        stubLookup();
        const { onChange, screen } = renderPicker();
        const s = await screen;

        await s.getByRole('button', { name: /Select a folder/ }).click();
        await s.getByText('Uploads').click();
        await s.getByRole('button', { name: 'Select "Uploads"' }).click();

        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ id: 'f1', name: 'Uploads' }));
    });

    it('tracks the navigated path as breadcrumbs', async () => {
        stubLookup();
        const { screen } = renderPicker();
        const s = await screen;

        await s.getByRole('button', { name: /Select a folder/ }).click();
        await s.getByText('Uploads').click();

        await expect.element(s.getByRole('button', { name: 'Root' })).toBeInTheDocument();
    });

    it('does not change the value when cancelled', async () => {
        stubLookup();
        const { onChange, screen } = renderPicker();
        const s = await screen;

        await s.getByRole('button', { name: /Select a folder/ }).click();
        await s.getByRole('button', { name: 'Cancel' }).click();

        expect(onChange).not.toHaveBeenCalled();
    });
});
