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

// https://astro.build/config
export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 3012,
  },

  vite: {
    // Any hostname: which ones are served is decided per request by the tenants' domains (see
    // src/tenant/index.ts), not here — an unregistered hostname gets a 404 from the middleware.
    server: {
      allowedHosts: true,
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

  // A pattern with no hostname matches every host. Astro only takes a request's hostname from its
  // Host (or a proxy's X-Forwarded-Host) header when it matches one of these — otherwise every
  // request would look like it came to `localhost` — and the middleware resolves the request's
  // tenant from exactly that hostname.
  security: {
    allowedDomains: [{}],
  },

  // Sessions live in Postgres (the `sessions` table) so they're shared across PM2 cluster workers
  // and can be listed/revoked per user. See src/session/driver.ts.
  session: {
    driver: { entrypoint: new URL("./src/session/driver.ts", import.meta.url) },
  },

  output: "server",
  adapter: node({
    mode: "standalone",
    staticHeaders: true,
  }),
});
