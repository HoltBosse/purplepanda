import type { ComponentConfig } from "@puckeditor/core";
import { type ComponentType, lazy, Suspense } from "react";
import * as z from "zod";
import type { VideoPlayerProps } from "./VideoPlayer.js";

// VideoPlayer drags in video.js and every provider embed (~270 KB), which a static import would put
// on every editor load whether or not the page has a Video block. So the browser code-splits it.
// The server keeps it eager: islands are rendered with renderToStaticMarkup, which can't wait on a
// lazy component.
const VideoPlayer: ComponentType<VideoPlayerProps> = import.meta.env.SSR
  ? (await import("./VideoPlayer.js")).default
  : lazy(() => import("./VideoPlayer.js"));

const ASPECT_PLACEHOLDER = <div style={{ aspectRatio: "16 / 9" }} />;

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
  render: ({ url, autoplay, puck }) => {
    if (!url) {
      return (
        <div className="rounded-lg border-2 border-dashed border-base-300 bg-base-200 p-6 text-center text-base-content/50">
          No video URL set
        </div>
      );
    }

    const player = <VideoPlayer url={url} autoplay={autoplay} />;

    // Inside a live Puck tree (the editor canvas, HistoryView) the lazy player needs its own
    // boundary, or its first load would suspend the whole editor. Island hydration renders without
    // `puck` (see hydrate-islands.ts) and must match the server's boundary-less markup, so there
    // it suspends the island's own root instead, which keeps the server HTML up until it's loaded.
    if (import.meta.env.SSR || !puck) return player;
    return <Suspense fallback={ASPECT_PLACEHOLDER}>{player}</Suspense>;
  },
};

export default Video;
