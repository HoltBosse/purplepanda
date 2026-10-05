import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import Video, { type VideoProps } from './Video';

const puck = { renderDropZone: () => null, metadata: {}, isEditing: false, dragRef: null };

const VideoRender = Video.render as (props: Record<string, unknown>) => React.JSX.Element;

// The player is code-split (see Video.tsx), so a set URL first renders a placeholder — wait for
// the real <video> rather than letting an assertion run against the fallback.
async function renderVideo(props: Partial<VideoProps> = {}) {
    const screen = await render(<VideoRender url="" autoplay={false} {...props} puck={puck} />);
    if (props.url) await expect.poll(() => screen.container.querySelector('video')).not.toBeNull();
    return screen;
}

describe('Video render', () => {
    it('shows a placeholder when no URL has been set', async () => {
        const screen = await renderVideo();

        await expect.element(screen.getByText('No video URL set')).toBeInTheDocument();
        expect(screen.container.querySelector('video')).toBeNull();
    });

    it('renders a player once a URL is set', async () => {
        const screen = await renderVideo({ url: 'https://example.com/clip.mp4' });

        expect(screen.container.textContent).not.toContain('No video URL set');
    });

    it('renders an HTML5 video element for a direct file URL', async () => {
        const screen = await renderVideo({ url: 'https://example.com/clip.mp4' });

        expect(screen.container.querySelector('video')).not.toBeNull();
    });

    it('keeps a 16:9 box so the player does not collapse to zero height', async () => {
        const screen = await renderVideo({ url: 'https://example.com/clip.mp4' });

        const boxed = [...screen.container.querySelectorAll<HTMLElement>('*')].some(
            (el) => el.style.aspectRatio === '16 / 9',
        );
        expect(boxed).toBe(true);
    });

    it('autoplays muted and looped, with controls hidden', async () => {
        const screen = await renderVideo({ url: 'https://example.com/clip.mp4', autoplay: true });

        const video = screen.container.querySelector('video');
        expect(video?.muted).toBe(true);
        expect(video?.loop).toBe(true);
        expect(video?.controls).toBe(false);
    });

    it('plays inline rather than going fullscreen on mobile', async () => {
        const screen = await renderVideo({ url: 'https://example.com/clip.mp4' });

        expect(screen.container.querySelector('video')?.hasAttribute('playsinline')).toBe(true);
    });

    it('renders the control skin only when not autoplaying', async () => {
        const withControls = await renderVideo({ url: 'https://example.com/clip.mp4', autoplay: false });
        const autoplaying = await renderVideo({ url: 'https://example.com/clip.mp4', autoplay: true });

        // The skin squares off the player's default rounded corners via this custom property, so
        // its presence is a reliable marker for "the skin rendered".
        const hasSkin = (root: HTMLElement) =>
            [...root.querySelectorAll<HTMLElement>('*')].some(
                (el) => el.style.getPropertyValue('--media-border-radius') === '0',
            );

        expect(hasSkin(withControls.container)).toBe(true);
        expect(hasSkin(autoplaying.container)).toBe(false);
    });
});

describe('Video consent notice', () => {
    const consent = {
        message: 'Hosted by {service}; playing loads {service}.',
        button: 'Play video',
        remember: true,
    };
    const youtube = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

    afterEach(() => {
        localStorage.clear();
    });

    async function renderWithConsent(props: Partial<VideoProps>) {
        return render(<VideoRender url="" autoplay={false} {...props} puck={puck} />);
    }

    it('covers a third-party player with the notice, naming the service', async () => {
        const screen = await renderWithConsent({ url: youtube, _consent: consent });

        await expect.element(screen.getByText('Hosted by YouTube; playing loads YouTube.')).toBeInTheDocument();
        await expect.element(screen.getByRole('link', { name: 'YouTube privacy policy' })).toBeInTheDocument();
        expect(screen.container.querySelector('iframe')).toBeNull();
    });

    it('loads the player once the visitor chooses to play', async () => {
        const screen = await renderWithConsent({ url: youtube, _consent: consent });

        await screen.getByRole('button', { name: 'Play video' }).click();

        await expect.poll(() => screen.container.querySelector('[data-video-consent]')).toBeNull();
        await expect.poll(() => screen.container.querySelector('iframe')).not.toBeNull();
    });

    it('remembers "always allow" per service in the browser', async () => {
        const first = await renderWithConsent({ url: youtube, _consent: consent });
        await first.getByRole('checkbox', { name: 'Always allow YouTube' }).click();
        await first.getByRole('button', { name: 'Play video' }).click();

        const again = await renderWithConsent({ url: youtube, _consent: consent });
        await expect.poll(() => again.container.querySelector('[data-video-consent]')).toBeNull();

        const vimeo = await renderWithConsent({ url: 'https://vimeo.com/76979871', _consent: consent });
        expect(vimeo.container.querySelector('[data-video-consent="vimeo"]')).not.toBeNull();
    });

    it('does not offer to remember when the site turned that off', async () => {
        const screen = await renderWithConsent({ url: youtube, _consent: { ...consent, remember: false } });

        expect(screen.container.querySelector('input[type="checkbox"]')).toBeNull();
    });

    it('plays a plain video file without asking, since there is no service involved', async () => {
        const screen = await renderVideo({ url: 'https://example.com/clip.mp4', _consent: consent });

        expect(screen.container.querySelector('[data-video-consent]')).toBeNull();
    });

    it('loads embeds straight away when the site has the notice off', async () => {
        const screen = await renderWithConsent({ url: youtube });

        await expect.poll(() => screen.container.querySelector('iframe')).not.toBeNull();
        expect(screen.container.querySelector('[data-video-consent]')).toBeNull();
    });
});
