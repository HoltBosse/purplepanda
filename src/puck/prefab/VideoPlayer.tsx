import "@videojs/react/video/skin.css";
import { parseVimeoSource } from "@videojs/core/dom/media/vimeo";
import { createPlayer } from "@videojs/react";
import { VimeoVideo } from "@videojs/react/media/vimeo-video";
import { Video as Html5Video, VideoSkin, videoFeatures } from "@videojs/react/video";
import { useEffect, useRef, type CSSProperties } from "react";

const Player = createPlayer({ features: videoFeatures });

export interface VideoPlayerProps {
  url: string;
  autoplay: boolean;
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
// Vimeo's iframe is cross-origin, so postMessage is the only channel available — and it turned
// out not to be reliable: inside the Puck editor, this component's DOM is portaled into the
// canvas's own `<iframe>` (see @puckeditor/core's `useFrame`/frame-root portal) while its JS
// keeps running in the top realm. In that doubly-nested configuration, Vimeo's postMessage
// `play` command was confirmed (via direct testing, bypassing this component entirely) to simply
// not resume a paused player — while calling `.play()` on Vimeo's own underlying <video> element
// worked instantly. Page JS can't reach across that origin boundary to do that directly, so the
// only channel left that's actually proven to work is forcing the iframe to fully reinitialize —
// i.e. automating the manual refresh that already fixes it. A React `key` bump was the first
// attempt at that, but it fights Puck's own iframe-portal lifecycle (`useFrame`) for control of
// the same DOM node and crashes the canvas ("removeChild... not a child of this node"). Mutating
// the live iframe's `src` directly through a ref sidesteps React's reconciler entirely — the
// browser reloads the iframe's content, but React never sees the DOM node itself change.
function useKeepAutoplaying(isVimeo: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!isVimeo) {
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
  }, [isVimeo]);

  return { videoRef, iframeRef };
}

export default function VideoPlayer({ url, autoplay }: VideoPlayerProps) {
  const isVimeo = parseVimeoSource(url) !== null;
  const { videoRef, iframeRef } = useKeepAutoplaying(isVimeo);

  // Autoplay implies a chromeless background-style video, so the control skin (which
  // always renders its control bar regardless of any per-instance props) is skipped entirely.
  if (autoplay) {
    return (
      <Player.Provider>
        <div style={{ aspectRatio: "16 / 9" } as CSSProperties}>
          {isVimeo ? (
            // `defaultMuted` (not just `muted`) is required here: it's what `buildVimeoIframeSrc`
            // reads to bake `muted=1` into the iframe's initial src, so Vimeo starts muted from
            // the first frame. `muted` alone only mutes live, via an async postMessage call to
            // the player after it loads — leaving a window where autoplay plays audibly.
            <VimeoVideo
              ref={iframeRef}
              src={url}
              autoplay
              muted
              defaultMuted
              loop
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
      </Player.Provider>
    );
  }

  return (
    <Player.Provider>
      {/* VideoSkin's root is width/height: 100%, with no intrinsic size of its own, so it
      collapses to whatever height the parent happens to give it unless sized here.
      --media-border-radius overrides the skin's default rounded corners (2rem). */}
      <VideoSkin
        style={{ aspectRatio: "16 / 9", "--media-border-radius": "0" } as CSSProperties}
      >
        {isVimeo ? <VimeoVideo src={url} /> : <Html5Video src={url} playsInline />}
      </VideoSkin>
    </Player.Provider>
  );
}
