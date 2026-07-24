import "@videojs/react/video/skin.css";
import type { ComponentConfig } from "@puckeditor/core";
import type { CSSProperties } from "react";
import { createPlayer } from "@videojs/react";
import { Video as Html5Video, VideoSkin, videoFeatures } from "@videojs/react/video";
import { VimeoVideo } from "@videojs/react/media/vimeo-video";
import { parseVimeoSource } from "@videojs/core/dom/media/vimeo";

const Player = createPlayer({ features: videoFeatures });

export type VideoProps = {
  url: string;
};

const Video: ComponentConfig<VideoProps> = {
  label: "Video",
  island: true,
  fields: {
    url: {
      type: "text",
      label: "Video URL",
    },
  },
  defaultProps: {
    url: "",
  },
  render: ({ url }) => {
    if (!url) {
      return (
        <div className="rounded-lg border-2 border-dashed border-base-300 bg-base-200 p-6 text-center text-base-content/50">
          No video URL set
        </div>
      );
    }

    const isVimeo = parseVimeoSource(url) !== null;

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
