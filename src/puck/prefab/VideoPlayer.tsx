import "@videojs/react/video/skin.css";
import { parseVimeoSource } from "@videojs/core/dom/media/vimeo";
import { createPlayer } from "@videojs/react";
import { VimeoVideo } from "@videojs/react/media/vimeo-video";
import { Video as Html5Video, VideoSkin, videoFeatures } from "@videojs/react/video";
import type { CSSProperties } from "react";

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
export default function VideoPlayer({ url, autoplay }: VideoPlayerProps) {
  const isVimeo = parseVimeoSource(url) !== null;

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
            <VimeoVideo src={url} autoplay muted defaultMuted loop controls={false} />
          ) : (
            <Html5Video
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
