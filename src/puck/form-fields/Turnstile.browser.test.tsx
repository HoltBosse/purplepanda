import type React from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import Turnstile from './Turnstile';
import type { TurnstileWidgetOptions } from './turnstile-settings';

const TurnstileRender = Turnstile.render as (props: Record<string, unknown>) => React.JSX.Element;

const notEditing = { isEditing: false };

const options: TurnstileWidgetOptions = {
    siteKey: 'key-123',
    theme: 'dark',
    size: 'flexible',
    appearance: 'interaction-only',
    language: 'pt-BR',
};

describe('Turnstile render', () => {
    it('shows an editor placeholder instead of the live widget while editing', async () => {
        const screen = await render(<TurnstileRender id="a" puck={{ isEditing: true }} _turnstile={options} />);

        await expect.element(screen.getByText(/placeholder while editing/)).toBeInTheDocument();
        expect(screen.container.querySelector('.cf-turnstile')).toBeNull();
    });

    it('warns when Turnstile has not been configured', async () => {
        const screen = await render(<TurnstileRender id="a" puck={notEditing} />);

        await expect.element(screen.getByText(/Turnstile is not configured/)).toBeInTheDocument();
        expect(screen.container.querySelector('.cf-turnstile')).toBeNull();
    });

    it('says where to set the keys in the warning, so the fix is actionable', async () => {
        const screen = await render(<TurnstileRender id="a" puck={notEditing} />);

        await expect.element(screen.getByText(/Settings → Turnstile/)).toBeInTheDocument();
    });

    it('renders the widget with the site key and options from the site settings', async () => {
        const screen = await render(<TurnstileRender id="a" puck={notEditing} _turnstile={options} />);

        const widget = screen.container.querySelector('.cf-turnstile');
        expect(widget?.getAttribute('data-sitekey')).toBe('key-123');
        expect(widget?.getAttribute('data-theme')).toBe('dark');
        expect(widget?.getAttribute('data-size')).toBe('flexible');
        expect(widget?.getAttribute('data-appearance')).toBe('interaction-only');
        expect(widget?.getAttribute('data-language')).toBe('pt-BR');
    });

    it('posts its token under the field name the form expects', async () => {
        const screen = await render(<TurnstileRender id="abc" puck={notEditing} _turnstile={options} />);

        expect(screen.container.querySelector('.cf-turnstile')?.getAttribute('data-response-field-name')).toBe(
            'field-abc',
        );
    });

    it('loads the Cloudflare script without blocking rendering', async () => {
        await render(<TurnstileRender id="a" puck={notEditing} _turnstile={options} />);

        // React 19 hoists `<script src>` out of the component tree into <head>, so this is not
        // found under the render container.
        const script = document.querySelector<HTMLScriptElement>(
            'script[src*="challenges.cloudflare.com"]',
        );
        expect(script).not.toBeNull();
        expect(script?.async).toBe(true);
        expect(script?.defer).toBe(true);
    });

    it('declares a secret key, so it is never sent to the editor or the browser', () => {
        expect(Turnstile.siteSettings?.fields.secretKey?.type).toBe('secret');
    });

    it('is excluded from the submissions display, since the token is not an answer', () => {
        expect(Turnstile.submissionDisplay).toBe(false);
    });
});
