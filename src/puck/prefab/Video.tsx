import type { ComponentConfig } from "@puckeditor/core";
import { type ComponentType, lazy, Suspense } from "react";
import * as z from "zod";
import VideoConsent from "./VideoConsent.js";
import type { VideoPlayerProps } from "./VideoPlayer.js";
import { detectEmbedProvider } from "./video-providers.js";
import { type VideoConsentOptions, videoSiteSettings } from "./video-settings.js";

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
  // Resolved by `data` below from the site's Video settings, never authored: the consent notice to
  // show over third-party players, or undefined when the site doesn't ask first.
  _consent?: VideoConsentOptions;
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
  siteSettings: videoSiteSettings,
  data: async () => {
    if (!import.meta.env.SSR) return {};
    const { getVideoConsentOptions } = await import("./video.server.js");
    return { _consent: await getVideoConsentOptions() };
  },
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
  render: ({ url, autoplay, _consent, puck }) => {
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
    const loaded = import.meta.env.SSR || !puck ? player : <Suspense fallback={ASPECT_PLACEHOLDER}>{player}</Suspense>;

    // Only third-party embeds wait for consent; a plain video file has no service to ask about.
    const provider = _consent ? detectEmbedProvider(url) : null;
    if (!_consent || !provider) return loaded;
    // The notice is what the server renders and the island hydrates, so the player only mounts
    // after a click — by then there's no server markup to keep, and it gets a boundary of its own
    // wherever it renders. Keyed by URL so changing the video in the editor asks again.
    return (
      <VideoConsent key={url} provider={provider} options={_consent}>
        <Suspense fallback={ASPECT_PLACEHOLDER}>{player}</Suspense>
      </VideoConsent>
    );
  },
};

export default Video;
