import type React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import Turnstile from './Turnstile';

const TurnstileRender = Turnstile.render as (props: Record<string, unknown>) => React.JSX.Element;

const notEditing = { isEditing: false };

describe('Turnstile render', () => {
    it('shows an editor placeholder instead of the live widget while editing', async () => {
        const screen = await render(<TurnstileRender id="a" puck={{ isEditing: true }} siteKey="key-123" />);

        await expect.element(screen.getByText(/placeholder while editing/)).toBeInTheDocument();
        expect(screen.container.querySelector('.cf-turnstile')).toBeNull();
    });

    it('warns when Turnstile has not been configured', async () => {
        const screen = await render(<TurnstileRender id="a" puck={notEditing} />);

        await expect.element(screen.getByText(/Turnstile is not configured/)).toBeInTheDocument();
        expect(screen.container.querySelector('.cf-turnstile')).toBeNull();
    });

    it('names the configured settings keys in the warning, so the fix is actionable', async () => {
        const screen = await render(<TurnstileRender id="a" puck={notEditing} />);

        await expect.element(screen.getByText(/turnstile_site_key and turnstile_secret_key/)).toBeInTheDocument();
    });

    it('renders the widget with the resolved site key once configured', async () => {
        const screen = await render(<TurnstileRender id="a" puck={notEditing} siteKey="key-123" />);

        const widget = screen.container.querySelector('.cf-turnstile');
        expect(widget?.getAttribute('data-sitekey')).toBe('key-123');
    });

    it('posts its token under the field name the form expects', async () => {
        const screen = await render(<TurnstileRender id="abc" puck={notEditing} siteKey="key-123" />);

        expect(screen.container.querySelector('.cf-turnstile')?.getAttribute('data-response-field-name')).toBe(
            'field-abc',
        );
    });

    it('loads the Cloudflare script without blocking rendering', async () => {
        await render(<TurnstileRender id="a" puck={notEditing} siteKey="key-123" />);

        // React 19 hoists `<script src>` out of the component tree into <head>, so this is not
        // found under the render container.
        const script = document.querySelector<HTMLScriptElement>(
            'script[src*="challenges.cloudflare.com"]',
        );
        expect(script).not.toBeNull();
        expect(script?.async).toBe(true);
        expect(script?.defer).toBe(true);
    });

    it('is excluded from the submissions display, since the token is not an answer', () => {
        expect(Turnstile.submissionDisplay).toBe(false);
    });
});
