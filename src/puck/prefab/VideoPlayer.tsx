import "@videojs/react/video/skin.css";
import { parseCloudflareSource } from "@videojs/media/dom/cloudflare";
import { parseSpotifySource } from "@videojs/media/dom/spotify";
import { parseTikTokSource } from "@videojs/media/dom/tiktok";
import { parseTwitchSource } from "@videojs/media/dom/twitch";
import { parseVimeoSource } from "@videojs/media/dom/vimeo";
import { parseYouTubeSource } from "@videojs/media/dom/youtube";
import { createPlayer } from "@videojs/react";
import { CloudflareVideo } from "@videojs/react/media/cloudflare-video";
import { SpotifyAudio } from "@videojs/react/media/spotify-audio";
import { TikTokVideo } from "@videojs/react/media/tiktok-video";
import { TwitchVideo } from "@videojs/react/media/twitch-video";
import { VimeoVideo } from "@videojs/react/media/vimeo-video";
import { YouTubeVideo } from "@videojs/react/media/youtube-video";
import { Video as Html5Video, VideoSkin, videoFeatures } from "@videojs/react/video";
import { type CSSProperties, useEffect, useRef } from "react";

const { Player } = createPlayer({ features: videoFeatures });

export interface VideoPlayerProps {
  url: string;
  autoplay: boolean;
}

type EmbedProvider = "youtube" | "vimeo" | "cloudflare" | "tiktok" | "twitch" | "spotify";

// Ordered by how likely a pasted URL is to be one of these — doesn't affect correctness, since
// each provider's matcher is specific to its own domain(s).
function detectEmbedProvider(src: string): EmbedProvider | null {
  if (parseYouTubeSource(src)) return "youtube";
  if (parseVimeoSource(src)) return "vimeo";
  if (parseCloudflareSource(src)) return "cloudflare";
  if (parseTikTokSource(src)) return "tiktok";
  if (parseTwitchSource(src)) return "twitch";
  if (parseSpotifySource(src)) return "spotify";
  return null;
}

// Split out of Video.tsx purely for readability — kept as a plain (non-lazy) import there. A
// React.lazy split here previously caused a second, sequential chunk fetch on top of the
// islands system's own lazy-load of the whole Video module on published pages, widening the gap
// between initial paint (raw <video autoplay> markup, no `muted` HTML attribute — React only
// sets it as a JS property once hydrated) and hydration attaching `muted` — long enough for
// autoplaying videos to audibly play unmuted for a moment. Keep this a synchronous import so
// Video.tsx + this module load as a single chunk, same as before the split.
// These are chromeless, controls-less background videos — nothing legitimate ever pauses them,
// so any `pause` is external and gets reversed on visibilitychange (backgrounding a tab is the
// only trigger a real user's tab-switch actually produces).
//
// The two branches need different remedies. Native <video> is same-origin, so calling .play()
// directly on the element always works and resumes from wherever it left off.
//
// Every embed provider here renders as a cross-origin iframe, so postMessage is the only channel
// available to reach it — and for Vimeo specifically that turned out not to be reliable: inside
// the Puck editor, this component's DOM is portaled into the canvas's own `<iframe>` (see
// @puckeditor/core's `useFrame`/frame-root portal) while its JS keeps running in the top realm.
// In that doubly-nested configuration, Vimeo's postMessage `play` command was confirmed (via
// direct testing, bypassing this component entirely) to simply not resume a paused player —
// while calling `.play()` on Vimeo's own underlying <video> element worked instantly. Page JS
// can't reach across that origin boundary to do that directly, so the only channel left that's
// actually proven to work is forcing the iframe to fully reinitialize — i.e. automating the
// manual refresh that already fixes it. A React `key` bump was the first attempt at that, but it
// fights Puck's own iframe-portal lifecycle (`useFrame`) for control of the same DOM node and
// crashes the canvas ("removeChild... not a child of this node"). Mutating the live iframe's
// `src` directly through a ref sidesteps React's reconciler entirely — the browser reloads the
// iframe's content, but React never sees the DOM node itself change. Applied to every embed
// provider, not just Vimeo, since the root cause (a cross-origin iframe nested inside Puck's
// portaled canvas iframe) isn't Vimeo-specific.
function useKeepAutoplaying(isIframeEmbed: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!isIframeEmbed) {
      const video = videoRef.current;
      if (!video) return;
      const resume = () => {
        if (!video.ended) video.play().catch(() => {});
      };
      video.addEventListener("pause", resume);
      return () => video.removeEventListener("pause", resume);
    }

    const handleVisibilityChange = () => {
      const iframe = iframeRef.current;
      if (document.visibilityState !== "visible" || !iframe?.src) return;
      const url = new URL(iframe.src);
      url.searchParams.set("_r", String(Date.now()));
      iframe.src = url.toString();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isIframeEmbed]);

  return { videoRef, iframeRef };
}

export default function VideoPlayer({ url, autoplay }: VideoPlayerProps) {
  const provider = detectEmbedProvider(url);
  const { videoRef, iframeRef } = useKeepAutoplaying(provider !== null);

  // Spotify's embed has no chromeless-autoplay mode: it doesn't support autoplay via URL params
  // at all, and passing controls={false} just hides the iframe outright rather than unlocking
  // silent playback (see SpotifyAudio's `display: none` when uncontrolled). So a Spotify URL
  // always renders as a normal, visible embed regardless of the block's "autoplay" toggle.
  const chromeless = autoplay && provider !== "spotify";

  // Autoplay implies a chromeless background-style video, so the control skin (which
  // always renders its control bar regardless of any per-instance props) is skipped entirely.
  if (chromeless) {
    return (
      <Player>
        <div style={{ aspectRatio: "16 / 9" } as CSSProperties}>
          {/* `defaultMuted` (not just `muted`) is required here: it's what each provider's
          buildIframeSrc helper reads to bake `muted=1`/`mute=1` into the iframe's initial src, so
          playback starts muted from the first frame. `muted` alone only mutes live, via an async
          postMessage call to the player after it loads — leaving a window where autoplay plays
          audibly. */}
          {provider === "youtube" ? (
            <YouTubeVideo
              ref={iframeRef}
              src={url}
              autoplay
              muted
              defaultMuted
              loop
              controls={false}
            />
          ) : provider === "vimeo" ? (
            <VimeoVideo
              ref={iframeRef}
              src={url}
              autoplay
              muted
              defaultMuted
              loop
              controls={false}
            />
          ) : provider === "cloudflare" ? (
            <CloudflareVideo
              ref={iframeRef}
              src={url}
              autoplay
              muted
              defaultMuted
              loop
              controls={false}
            />
          ) : provider === "tiktok" ? (
            <TikTokVideo
              ref={iframeRef}
              src={url}
              autoplay
              muted
              defaultMuted
              loop
              controls={false}
            />
          ) : provider === "twitch" ? (
            <TwitchVideo
              ref={iframeRef}
              src={url}
              autoplay
              muted
              defaultMuted
              controls={false}
            />
          ) : (
            <Html5Video
              ref={videoRef}
              src={url}
              playsInline
              autoPlay
              muted
              loop
              controls={false}
              style={{ width: "100%", height: "100%" }}
            />
          )}
        </div>
      </Player>
    );
  }

  if (provider === "spotify") {
    // Unlike every other provider here, Spotify's embed has no headless mode driven by an
    // external skin — leaving `controls` at its default renders nothing at all (see the
    // chromeless-branch comment above), so it always shows its own native player UI. Wrapping it
    // in VideoSkin the same way as the others would layer our overlay controls on top of Spotify's
    // own, and VideoSkin's fixed 16:9 sizing squashes Spotify's much shorter native player, so it
    // renders standalone instead.
    return (
      <Player>
        <SpotifyAudio ref={iframeRef} src={url} controls />
      </Player>
    );
  }

  return (
    <Player>
      {/* VideoSkin's root is width/height: 100%, with no intrinsic size of its own, so it
      collapses to whatever height the parent happens to give it unless sized here.
      --media-border-radius overrides the skin's default rounded corners (2rem). */}
      <VideoSkin
        style={{ aspectRatio: "16 / 9", "--media-border-radius": "0" } as CSSProperties}
      >
        {provider === "youtube" ? (
          <YouTubeVideo src={url} />
        ) : provider === "vimeo" ? (
          <VimeoVideo src={url} />
        ) : provider === "cloudflare" ? (
          <CloudflareVideo src={url} />
        ) : provider === "tiktok" ? (
          <TikTokVideo src={url} />
        ) : provider === "twitch" ? (
          <TwitchVideo src={url} />
        ) : (
          <Html5Video src={url} playsInline />
        )}
      </VideoSkin>
    </Player>
  );
}
