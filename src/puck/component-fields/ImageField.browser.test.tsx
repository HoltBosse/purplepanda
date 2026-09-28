import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { imageField } from './ImageField';

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

describe('imageField minimal mode', () => {
    it('defaults to minimal: false', () => {
        expect(imageField.minimal).toBe(false);
    });

    it('shows the crop, focus, and sizing controls by default', async () => {
        const Render = imageField.render as unknown as (props: {
            field: typeof imageField;
            value: ImageValue;
            onChange: (value: ImageValue) => void;
        }) => React.JSX.Element;
        const s = await render(
            <Render field={imageField} value={{ id: 'img-1', title: 'Sunset' } as ImageValue} onChange={vi.fn()} />,
        );

        await expect.element(s.getByRole('button', { name: 'Crop image' })).toBeInTheDocument();
        await expect.element(s.getByRole('button', { name: 'Set focus point' })).toBeInTheDocument();
        await expect.element(s.getByText('Sizing')).toBeInTheDocument();
    });

    it('hides the crop, focus, and sizing controls when minimal: true, leaving just the picker button', async () => {
        const minimalField = { ...imageField, minimal: true };
        const Render = imageField.render as unknown as (props: {
            field: typeof minimalField;
            value: ImageValue;
            onChange: (value: ImageValue) => void;
        }) => React.JSX.Element;
        const s = await render(
            <Render field={minimalField} value={{ id: 'img-1', title: 'Sunset' } as ImageValue} onChange={vi.fn()} />,
        );

        await expect.element(s.getByText('Sunset')).toBeInTheDocument();
        await expect.element(s.getByRole('button', { name: 'Crop image' })).not.toBeInTheDocument();
        await expect.element(s.getByRole('button', { name: 'Set focus point' })).not.toBeInTheDocument();
        await expect.element(s.getByText('Sizing')).not.toBeInTheDocument();
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

describe('imageField upload', () => {
    /** Serves the lookup like stubLookup, and answers the upload endpoint with `uploadResponse`. */
    function stubLookupAndUpload(uploadResponse: () => Response) {
        const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) =>
            String(input).includes('/admin/media/api/upload')
                ? uploadResponse()
                : new Response(JSON.stringify({ images: mediaItems, folders: [], totalPages: 1 }), { status: 200 }),
        );
        vi.stubGlobal('fetch', fetchMock);
        return fetchMock;
    }

    async function openAndChooseFile(s: Awaited<ReturnType<typeof render>>, name = 'my-new_photo.png') {
        await s.container.querySelector('button')?.click();
        await expect.element(s.getByRole('button', { name: 'Upload', exact: true })).toBeInTheDocument();

        const input = s.container.querySelector('input[type="file"]') as HTMLInputElement;
        const transfer = new DataTransfer();
        transfer.items.add(new File(['png'], name, { type: 'image/png' }));
        input.files = transfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    it('prefills title and alt from the chosen file name', async () => {
        stubLookupAndUpload(() => new Response('{}', { status: 500 }));
        const { screen } = renderPicker();
        const s = await screen;

        await openAndChooseFile(s);

        await expect.element(s.getByLabelText('Title')).toHaveValue('my new photo');
        await expect.element(s.getByLabelText('Alt')).toHaveValue('my new photo');
    });

    it('uploads a single image and selects it', async () => {
        const fetchMock = stubLookupAndUpload(
            () => new Response(JSON.stringify({ images: [{ id: 'img-new', title: 'my new photo', alt: 'my new photo' }] }), { status: 201 }),
        );
        const { onChange, screen } = renderPicker();
        const s = await screen;

        await openAndChooseFile(s);
        await s.getByRole('button', { name: 'Upload image' }).click();

        await expect.poll(() => onChange.mock.calls.length).toBeGreaterThan(0);
        expect(onChange.mock.calls[0]?.[0]).toMatchObject({ id: 'img-new', title: 'my new photo' });

        const uploadCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/admin/media/api/upload'));
        const body = uploadCall?.[1]?.body as FormData;
        expect(uploadCall?.[1]?.method).toBe('POST');
        expect(body.getAll('title[]')).toEqual(['my new photo']);
        expect((body.get('file[]') as File).name).toBe('my-new_photo.png');
    });

    it('shows the server error and keeps the form when the upload fails', async () => {
        stubLookupAndUpload(() => new Response(JSON.stringify({ error: 'Only image files can be uploaded.' }), { status: 400 }));
        const { onChange, screen } = renderPicker();
        const s = await screen;

        await openAndChooseFile(s);
        await s.getByRole('button', { name: 'Upload image' }).click();

        await expect.element(s.getByRole('alert')).toHaveTextContent('Only image files can be uploaded.');
        await expect.element(s.getByLabelText('Title')).toBeInTheDocument();
        expect(onChange).not.toHaveBeenCalled();
    });
});
