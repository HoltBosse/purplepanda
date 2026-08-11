import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { imageField } from './ImagePicker';

type ImageValue = Parameters<NonNullable<typeof imageField.render>>[0]['value'];

const ImagePickerRender = imageField.render as (props: {
    value: ImageValue;
    onChange: (value: ImageValue) => void;
}) => React.JSX.Element;

const mediaItems = [
    { id: 'img-1', title: 'Sunset', alt: 'A sunset' },
    { id: 'img-2', title: 'Mountain', alt: 'A mountain' },
];

/** The picker lists media from /admin/media/api/lookup; tests serve that from memory. */
function stubLookup(images = mediaItems, folders: unknown[] = []) {
    const fetchMock = vi.fn(
        async (_input: RequestInfo | URL, _init?: RequestInit) =>
            new Response(JSON.stringify({ images, folders, totalPages: 1 }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
}

function renderPicker(value: ImageValue = null) {
    const onChange = vi.fn();
    return { onChange, screen: render(<ImagePickerRender value={value} onChange={onChange} />) };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('imageField configuration', () => {
    it('is registered as a custom Puck field', () => {
        expect(imageField.type).toBe('custom');
        expect(imageField.label).toBe('Image');
    });
});

describe('imageField closed state', () => {
    it('renders a control for choosing an image when empty', async () => {
        const { screen } = renderPicker();
        const s = await screen;

        expect(s.container.querySelector('button')).not.toBeNull();
    });

    it('renders without throwing when given an existing image', async () => {
        const { screen } = renderPicker({ id: 'img-1' } as ImageValue);
        const s = await screen;

        expect(s.container.textContent).not.toBe('');
    });

    it('previews the selected image from the image endpoint', async () => {
        const { screen } = renderPicker({ id: 'img-1' } as ImageValue);
        const s = await screen;

        await expect
            .poll(() => s.container.querySelector('img')?.getAttribute('src') ?? '')
            .toContain('/image/img-1');
    });
});

describe('imageField dialog', () => {
    it('loads media from the lookup endpoint when opened', async () => {
        const fetchMock = stubLookup();
        const { screen } = renderPicker();
        const s = await screen;

        await s.container.querySelector('button')?.click();

        await expect.poll(() => fetchMock.mock.calls.length).toBeGreaterThan(0);
        expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/admin/media/api/lookup');
    });

    it('lists the returned images', async () => {
        stubLookup();
        const { screen } = renderPicker();
        const s = await screen;

        await s.container.querySelector('button')?.click();

        await expect.element(s.getByText('Sunset').first()).toBeInTheDocument();
    });

    it('survives an empty media library', async () => {
        stubLookup([]);
        const { screen } = renderPicker();
        const s = await screen;

        await s.container.querySelector('button')?.click();

        await expect.poll(() => s.container.querySelector('dialog')).not.toBeNull();
    });

    it('does not change the value merely by opening the dialog', async () => {
        stubLookup();
        const { onChange, screen } = renderPicker();
        const s = await screen;

        await s.container.querySelector('button')?.click();
        await expect.poll(() => s.container.querySelector('dialog')).not.toBeNull();

        expect(onChange).not.toHaveBeenCalled();
    });
});
