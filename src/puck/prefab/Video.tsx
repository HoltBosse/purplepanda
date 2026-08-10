import "@videojs/react/video/skin.css";
import type { ComponentConfig } from "@puckeditor/core";
import { parseVimeoSource } from "@videojs/core/dom/media/vimeo";
import { createPlayer } from "@videojs/react";
import { VimeoVideo } from "@videojs/react/media/vimeo-video";
import { Video as Html5Video, VideoSkin, videoFeatures } from "@videojs/react/video";
import type { CSSProperties } from "react";

const Player = createPlayer({ features: videoFeatures });

export type VideoProps = {
  url: string;
  autoplay: boolean;
};

const Video: ComponentConfig<VideoProps> = {
  label: "Video",
  island: true,
  fields: {
    url: {
      type: "text",
      label: "Video URL",
    },
    autoplay: {
      type: "radio",
      label: "Autoplay",
      options: [
        { label: "Yes", value: true },
        { label: "No", value: false },
      ],
    },
  },
  defaultProps: {
    url: "",
    autoplay: false,
  },
  render: ({ url, autoplay }) => {
    if (!url) {
      return (
        <div className="rounded-lg border-2 border-dashed border-base-300 bg-base-200 p-6 text-center text-base-content/50">
          No video URL set
        </div>
      );
    }

    const isVimeo = parseVimeoSource(url) !== null;

    // Autoplay implies a chromeless background-style video, so the control skin (which
    // always renders its control bar regardless of any per-instance props) is skipped entirely.
    if (autoplay) {
      return (
        <Player.Provider>
          <div style={{ aspectRatio: "16 / 9" } as CSSProperties}>
            {isVimeo ? (
              <VimeoVideo src={url} autoplay muted loop controls={false} />
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
  },
};

export default Video;
