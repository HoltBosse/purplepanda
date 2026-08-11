import type { PuckContext } from '@puckeditor/core';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import Image, { type ImageProps } from './Image';

const fakePuck: PuckContext = {
    renderDropZone: () => null,
    metadata: {},
    isEditing: false,
    dragRef: null,
};

const folder = { id: '0b6d1f2c-7f5e-4a1b-9c3d-2e4f6a8b0c1d', name: 'Uploads' };

const baseProps: ImageProps = {
    label: 'Upload an image',
    description: '',
    required: false,
    folder: folder as ImageProps['folder'],
};

function renderImage(props: Partial<ImageProps> = {}) {
    return render(<Image.render id="a" {...baseProps} {...props} puck={fakePuck} />);
}

const renderSubmissionValue = Image.renderSubmissionValue as (value: unknown) => string;

describe('Image render', () => {
    it('renders a file input restricted to images', async () => {
        const screen = await renderImage();

        const input = screen.container.querySelector('input[type="file"]');
        expect(input).not.toBeNull();
        expect(input?.getAttribute('accept')).toBe('image/*');
    });

    it('marks the input required and shows a required marker when required', async () => {
        const screen = await renderImage({ required: true });

        await expect.element(screen.getByText('*')).toBeInTheDocument();
        expect(screen.container.querySelector('input[type="file"]')?.hasAttribute('required')).toBe(true);
    });

    it('warns the author when no destination folder is configured', async () => {
        const screen = await renderImage({ folder: null });

        await expect.element(screen.getByText(/isn't configured with a destination folder/)).toBeInTheDocument();
    });

    it('shows no folder warning once a folder is set', async () => {
        const screen = await renderImage();

        expect(screen.container.textContent).not.toContain('destination folder');
    });
});

describe('Image renderSubmissionValue', () => {
    it('returns an empty string when there is no media reference', () => {
        expect(renderSubmissionValue(null)).toBe('');
        expect(renderSubmissionValue(undefined)).toBe('');
        expect(renderSubmissionValue({})).toBe('');
    });

    it('links to the full image and renders a resized thumbnail', () => {
        const html = renderSubmissionValue({ id: 'abc', title: 'Logo', alt: 'A logo' });

        expect(html).toContain('href="/image/abc"');
        expect(html).toContain('src="/image/abc?fmt=webp&w=200&q=80"');
    });

    it('opens the full image in a new tab without leaking the opener', () => {
        const html = renderSubmissionValue({ id: 'abc', title: 'Logo', alt: 'A logo' });

        expect(html).toContain('target="_blank"');
        expect(html).toContain('rel="noopener noreferrer"');
    });

    it('prefers alt, falling back to title then a generic label', () => {
        expect(renderSubmissionValue({ id: 'a', title: 'T', alt: 'A' })).toContain('alt="A"');
        expect(renderSubmissionValue({ id: 'a', title: 'T', alt: '' })).toContain('alt="T"');
        expect(renderSubmissionValue({ id: 'a' })).toContain('alt="Uploaded image"');
    });

    // This string is injected into the submissions viewer as raw HTML, so escaping is the only
    // thing standing between a crafted alt/title and script execution in an admin's browser.
    it('escapes HTML-significant characters in alt', () => {
        const html = renderSubmissionValue({ id: 'a', title: '', alt: '<script>alert(1)</script>' });

        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;script&gt;');
    });

    it('escapes a quote that would otherwise break out of the alt attribute', () => {
        const html = renderSubmissionValue({ id: 'a', title: '', alt: '" onerror="alert(1)' });

        expect(html).toContain('&quot;');
        expect(html).not.toMatch(/alt="".*onerror=/);
    });

    it('escapes HTML-significant characters in title', () => {
        const html = renderSubmissionValue({ id: 'a', title: '<img src=x onerror=alert(1)>', alt: 'ok' });

        expect(html).not.toContain('<img src=x');
        expect(html).toContain('&lt;img');
    });

    it('escapes ampersands without double-escaping the result', () => {
        const html = renderSubmissionValue({ id: 'a', title: '', alt: 'Tom & Jerry' });

        expect(html).toContain('alt="Tom &amp; Jerry"');
        expect(html).not.toContain('&amp;amp;');
    });

    it('produces markup the browser parses as a single link, not injected nodes', () => {
        const html = renderSubmissionValue({ id: 'a', title: '', alt: '"><script>alert(1)</script>' });

        const host = document.createElement('div');
        host.innerHTML = html;
        expect(host.querySelector('script')).toBeNull();
        expect(host.children).toHaveLength(1);
        expect(host.firstElementChild?.tagName).toBe('A');
    });
});
