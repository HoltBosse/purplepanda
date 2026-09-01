import { describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { ogField } from './OpenGraphField';

describe('ogField', () => {
    it('groups title, description, and image sub-fields under an "Open Graph" category', () => {
        expect(ogField.label).toBe('Open Graph');
        expect(ogField.objectFields.title?.type).toBe('text');
        expect(ogField.objectFields.description?.type).toBe('textarea');
        expect(ogField.objectFields.image?.type).toBe('custom');
    });

    // Open Graph is secondary/optional relative to the rest of root fields, so it shouldn't
    // compete for attention with title/alias/etc. on load.
    it('is collapsed by default', () => {
        expect(ogField.defaultExpanded).toBe(false);
    });

    it('renders the "Open Graph" header collapsed, expanding to reveal both text sub-field labels on click', async () => {
        const Render = ogField.render as (props: any) => React.JSX.Element;
        const s = await render(<Render value={undefined} onChange={vi.fn()} />);

        await expect.element(s.getByText('Open Graph')).toBeInTheDocument();
        const header = s.getByRole('button', { name: 'Open Graph' });
        await expect.element(header).toHaveAttribute('aria-expanded', 'false');
        await expect.element(s.getByText('Title', { exact: true })).not.toBeInTheDocument();

        await header.click();

        await expect.element(header).toHaveAttribute('aria-expanded', 'true');
        await expect.element(s.getByText('Title', { exact: true })).toBeInTheDocument();
        await expect.element(s.getByText('Description', { exact: true })).toBeInTheDocument();
    });

    // og:image uses the raw uploaded image as-is (see page.astro) — the crop/focus/sizing
    // controls that matter for an image actually laid out on the page are just noise here.
    it('renders the image sub-field in minimal mode, with no crop/focus/sizing controls', async () => {
        const Render = ogField.render as (props: any) => React.JSX.Element;
        const s = await render(<Render value={undefined} onChange={vi.fn()} />);

        await s.getByRole('button', { name: 'Open Graph' }).click();

        await expect.element(s.getByText('Select an image...')).toBeInTheDocument();
        await expect.element(s.getByRole('button', { name: 'Crop image' })).not.toBeInTheDocument();
        await expect.element(s.getByRole('button', { name: 'Set focus point' })).not.toBeInTheDocument();
        await expect.element(s.getByText('Sizing')).not.toBeInTheDocument();
    });
});
