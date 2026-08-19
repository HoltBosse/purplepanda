import type { ComponentConfig } from "@puckeditor/core";
import * as z from "zod";
import VideoPlayer from "./VideoPlayer.js";

export type VideoProps = {
  url: string;
  autoplay: boolean;
};

// Not a strict `z.url()` — a bare embed path/id is a valid value here, not just an absolute URL —
// but an empty block renders nothing useful on a published page, so a value is still required.
function toPropsSchema() {
  return z.object({ url: z.string().trim().min(1, "Video URL is required") }).loose();
}

const Video: ComponentConfig<VideoProps> = {
  label: "Video",
  island: true,
  propsSchema: toPropsSchema,
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

    return <VideoPlayer url={url} autoplay={autoplay} />;
  },
};

export default Video;
