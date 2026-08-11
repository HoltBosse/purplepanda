import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import Video, { type VideoProps } from './Video';

const puck = { renderDropZone: () => null, metadata: {}, isEditing: false, dragRef: null };

const VideoRender = Video.render as (props: Record<string, unknown>) => React.JSX.Element;

function renderVideo(props: Partial<VideoProps> = {}) {
    return render(<VideoRender url="" autoplay={false} {...props} puck={puck} />);
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
