// @ts-check
import node from "@astrojs/node";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import "dotenv/config";
import { generateIslandsManifest } from "./src/islands-manifest.js";

// Per-component lazy loaders for front-end islands, derived at build time from the Puck config so
// only the island(s) present on a page load — not the whole config, and not every editor-only
// dependency it drags in. See src/islands-manifest.ts, and src/puck/hydrate-islands.ts for the
// consumer.
const VIRTUAL_ISLANDS_ID = "virtual:purplepanda/islands";
const RESOLVED_VIRTUAL_ISLANDS_ID = `\0${VIRTUAL_ISLANDS_ID}`;
const PUCK_CONFIG_MODULE = new URL("./src/puck.config.tsx", import.meta.url).pathname;

// Public hostname the site is served on (e.g. example.com). Optional: when unset, only localhost
// requests are accepted by the dev server and no forwarded-host domain is trusted.
const SITE_HOSTNAME = process.env.SITE_HOSTNAME?.trim() || undefined;

// https://astro.build/config
export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 3012,
  },

  vite: {
    server: {
      allowedHosts: SITE_HOSTNAME ? [SITE_HOSTNAME] : [],
    },
    plugins: [
      tailwindcss(),
      {
        name: "purple-panda-islands",
        resolveId(id) {
          return id === VIRTUAL_ISLANDS_ID ? RESOLVED_VIRTUAL_ISLANDS_ID : null;
        },
        async load(id) {
          if (id !== RESOLVED_VIRTUAL_ISLANDS_ID) return null;
          return generateIslandsManifest(
            PUCK_CONFIG_MODULE,
            (source, importer) => this.resolve(source, importer),
            (code) => this.parse(code),
          );
        },
      },
    ],
    optimizeDeps: {
      // The Puck editor islands are mounted via client:only/client:load, so Vite's startup
      // dependency scanner (which crawls static imports from page entry points) doesn't reliably
      // discover them ahead of time. Without this, the first navigation to an editor page in a dev
      // session triggers an on-demand re-optimization ("new dependencies optimized, reloading") of
      // this entire list, which forces a full page reload mid-load. Listing them here makes Vite
      // pre-bundle them at server startup instead.
      //
      // The @videojs/* entries guard the same failure mode for a different reason: VideoPlayer.tsx
      // is only reachable through the editor's Video palette component, so the mid-session
      // re-optimization it triggers on first editor load broadcasts a dev-server-wide reload to
      // every connected tab — including tabs sitting on an already-hydrated published page — which
      // is what stops that page's autoplaying video until a manual refresh.
      include: [
        "@puckeditor/core",
        "@dnd-kit/dom",
        "@dnd-kit/react",
        "@dnd-kit/abstract",
        "@dnd-kit/geometry",
        "@dnd-kit/helpers",
        "@dnd-kit/state",
        "@tiptap/react",
        "@tiptap/core",
        "@tiptap/extension-subscript",
        "@tiptap/extension-superscript",
        "@tiptap/extensions",
        "@videojs/react",
        "@videojs/react/video",
        "@videojs/react/media/vimeo-video",
        "@videojs/react/media/youtube-video",
        "@videojs/react/media/cloudflare-video",
        "@videojs/react/media/spotify-audio",
        "@videojs/react/media/tiktok-video",
        "@videojs/react/media/twitch-video",
        "@videojs/media/dom/vimeo",
        "@videojs/media/dom/youtube",
        "@videojs/media/dom/cloudflare",
        "@videojs/media/dom/spotify",
        "@videojs/media/dom/tiktok",
        "@videojs/media/dom/twitch",
      ],
    },
  },

  integrations: [react()],

  security: {
    allowedDomains: SITE_HOSTNAME ? [{ hostname: SITE_HOSTNAME }] : [],
  },

  output: "server",
  adapter: node({
    mode: "standalone",
    staticHeaders: true,
  }),
});
