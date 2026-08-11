import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import type { AstroIntegration } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { setDb } from "./db/db.js";
import { setDocumentPath } from "./document/document.js";
import { generateIslandsManifest } from "./islands-manifest.js";
import { setMediaPath } from "./media/media.js";

const VIRTUAL_PUCK_CONFIG_ID = "virtual:purplepanda/puck-config";
const RESOLVED_VIRTUAL_PUCK_CONFIG_ID = `\0${VIRTUAL_PUCK_CONFIG_ID}`;

const VIRTUAL_HAS_404_ID = "virtual:purplepanda/has-404";
const RESOLVED_VIRTUAL_HAS_404_ID = `\0${VIRTUAL_HAS_404_ID}`;

// Per-component lazy loaders for front-end islands, auto-derived from the Puck config so only the
// island(s) present on a page load — not the whole config. See ./islands-manifest.ts.
const VIRTUAL_ISLANDS_ID = "virtual:purplepanda/islands";
const RESOLVED_VIRTUAL_ISLANDS_ID = `\0${VIRTUAL_ISLANDS_ID}`;

export interface PurplePandaIntegrationOptions {
  enabled?: boolean;
  db?: NodePgDatabase<Record<string, unknown>>;
  mediaPath?: string;
  documentPath?: string;
  puckConfigModule?: string;
}

const MIME_TYPES: Record<string, string> = {
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".css": "text/css",
  ".js": "application/javascript",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

function copyDir(src: string, dest: string) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      copyFileSync(srcPath, destPath);
    }
  }
}

export default function purplePandaIntegration(options: PurplePandaIntegrationOptions = {}): AstroIntegration {
  // Resolves to src/assets/ relative to dist/index.js at runtime
  const assetsDir = fileURLToPath(new URL("../src/assets/", import.meta.url));

  return {
    name: "purple-panda",
    hooks: {
      "astro:config:setup": ({ updateConfig, injectScript, addMiddleware, injectRoute, logger, config }) => {
        if (options.enabled === false) return;

        if (options.db) {
          setDb(options.db);
        } else {
          //error out if no db provided, since it's required for the integration to work
          throw new Error("[purple-panda] No db provided. Pass `db` to purplePandaIntegration().");
        }

        if(options.mediaPath) {
          //check that mediaPath is a valid directory
          if (!existsSync(options.mediaPath) || !statSync(options.mediaPath).isDirectory()) {
            throw new Error(`[purple-panda] Invalid media path provided: ${options.mediaPath}. It must be a valid directory.`);
          }

          setMediaPath(options.mediaPath);
        } else {
          throw new Error("[purple-panda] No media path provided. Pass `mediaPath` to purplePandaIntegration().");
        }

        if (options.documentPath) {
          if (!existsSync(options.documentPath) || !statSync(options.documentPath).isDirectory()) {
            throw new Error(`[purple-panda] Invalid document path provided: ${options.documentPath}. It must be a valid directory.`);
          }
          setDocumentPath(options.documentPath);
        }

        const srcDir = fileURLToPath(config.srcDir);
        const has404Page = ['404.astro', '404.md', '404.mdx'].some(f =>
          existsSync(join(srcDir, 'pages', f))
        );

        logger.info("Setting up purple-panda");

        // Front-end island hydration. Components flagged `island: true` render a
        // `[data-puck-island]` marker around their output (see src/puck/islands.tsx); this runtime
        // finds those markers and hydrates each one into an interactive React root using the same
        // component's `render`. The Puck config (and React) are dynamically imported only when a
        // marker is actually present, so pages without islands ship effectively no JS for this.
        injectScript(
          "page",
          `
          // Only hydrate on pages that render PageRenderer as static HTML (the published page and
          // the draft preview routes), which opt in by marking their <body>. Pages that embed
          // PageRenderer inside a live React tree (e.g. HistoryView, client:load) deliberately omit
          // the attribute, so their markers are never independently hydrated (that would double-mount).
          const markers = document.body.hasAttribute("data-purplepanda-islands")
            ? document.querySelectorAll("[data-puck-island]")
            : [];
          if (markers.length > 0) {
            // In dev, @astrojs/react instruments component modules with React Fast Refresh globals
            // ($RefreshReg$/$RefreshSig$). Astro only defines those on pages that host a client:*
            // React island; this page has none, so importing the config below would throw
            // "$RefreshSig$ is not defined". Provide no-op stubs so the instrumented modules
            // evaluate (islands here don't need HMR). In production these globals aren't emitted, so
            // this is a harmless no-op.
            window.$RefreshReg$ = window.$RefreshReg$ || function () {};
            window.$RefreshSig$ = window.$RefreshSig$ || function () { return function (type) { return type; }; };
            window.__vite_plugin_react_preamble_installed__ = true;
            Promise.all([
              import("virtual:purplepanda/islands"),
              import("react"),
              import("react-dom/client"),
            ]).then(async ([islandsModule, React, ReactDOMClient]) => {
              const loaders = islandsModule.default || {};
              // Fallback for any island the build-time analyzer couldn't map to its own module
              // (e.g. a component defined inline in the config): import the whole config lazily and
              // only when such an island is actually present.
              let fullConfig = null;
              const resolveComponent = async (name) => {
                const loader = loaders[name];
                if (loader) {
                  try { return await loader(); } catch { return null; }
                }
                if (!fullConfig) {
                  fullConfig = (await import("virtual:purplepanda/puck-config")).default || {};
                }
                return (fullConfig.components || {})[name];
              };
              for (const el of markers) {
                const name = el.getAttribute("data-puck-island");
                const component = await resolveComponent(name);
                if (!component || typeof component.render !== "function") continue;
                let props = {};
                try {
                  props = JSON.parse(el.getAttribute("data-puck-props") || "{}");
                } catch {
                  // Malformed payload: leave the server-rendered HTML in place.
                  continue;
                }
                ReactDOMClient.hydrateRoot(el, React.createElement(component.render, props));
              }
            });
          }
        `,
        );

        // Example: tweak Vite config
        updateConfig({
          vite: {
            plugins: [
              tailwindcss(),
              {
                name: "purple-panda-assets",
                resolveId(id) {
                  if (id === VIRTUAL_PUCK_CONFIG_ID) return RESOLVED_VIRTUAL_PUCK_CONFIG_ID;
                  if (id === VIRTUAL_HAS_404_ID) return RESOLVED_VIRTUAL_HAS_404_ID;
                  if (id === VIRTUAL_ISLANDS_ID) return RESOLVED_VIRTUAL_ISLANDS_ID;
                  return null;
                },
                async load(id) {
                  if (id === RESOLVED_VIRTUAL_HAS_404_ID) {
                    return `export const has404Page = ${has404Page};`;
                  }

                  const puckConfigModulePath = () => {
                    if (!options.puckConfigModule) return null;
                    const rootDir = fileURLToPath(config.root);
                    return options.puckConfigModule.startsWith(".")
                      ? resolve(rootDir, options.puckConfigModule)
                      : options.puckConfigModule;
                  };

                  if (id === RESOLVED_VIRTUAL_ISLANDS_ID) {
                    const modulePath = puckConfigModulePath();
                    if (!modulePath) return "export default {};";
                    const pluginContext = this as unknown as {
                      resolve: (source: string, importer: string) => Promise<{ id: string } | null | undefined>;
                      parse: (code: string) => unknown;
                    };
                    return generateIslandsManifest(
                      modulePath,
                      (source, importer) => pluginContext.resolve(source, importer),
                      (code) => pluginContext.parse(code),
                    );
                  }

                  if (id !== RESOLVED_VIRTUAL_PUCK_CONFIG_ID) {
                    return null;
                  }

                  const modulePath = puckConfigModulePath();
                  if (!modulePath) {
                    return "export default {};";
                  }

                  return `export { default } from ${JSON.stringify(modulePath)};`;
                },
                configureServer(server) {
                  server.middlewares.use("/admin/assets", (req, res, next) => {
                    const urlPath = (req.url ?? "/").split("?")[0];
                    const safePath = resolve(assetsDir, `.${urlPath}`);

                    // Prevent directory traversal attacks
                    if (!safePath.startsWith(assetsDir)) {
                      res.writeHead(403);
                      res.end();
                      return;
                    }

                    if (!existsSync(safePath)) {
                      next();
                      return;
                    }

                    const mime = MIME_TYPES[extname(safePath).toLowerCase()] ?? "application/octet-stream";
                    res.setHeader("Content-Type", mime);
                    createReadStream(safePath).pipe(res);
                  });
                },
              },
            ],
            define: {
              __PURPLE_PANDA__: JSON.stringify(true),
            },
            optimizeDeps: {
              // The Puck editor islands are mounted via client:only/client:load, so Vite's
              // startup dependency scanner (which crawls static imports from page entry
              // points) doesn't reliably discover them ahead of time. Without this, the
              // first navigation to an editor page in a dev session triggers an on-demand
              // re-optimization ("new dependencies optimized, reloading") of this entire
              // list, which forces a full page reload mid-load. Listing them here makes
              // Vite pre-bundle them at server startup instead.
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
              ],
            },
          },
        });

        injectRoute({
          pattern: "/admin/login",
          entrypoint: "@holtbosse/purplepanda/pages/admin/login.astro",
        });

        injectRoute({
          pattern: "/admin/login-action",
          entrypoint: "@holtbosse/purplepanda/pages/admin/login-action.ts",
        });

        injectRoute({
          pattern: "/admin/logout",
          entrypoint: "@holtbosse/purplepanda/pages/admin/logout.ts",
        });

        injectRoute({
          pattern: "/admin",
          entrypoint: "@holtbosse/purplepanda/pages/admin/index.astro",
        });

        injectRoute({
          pattern: "/admin/demo",
          entrypoint: "@holtbosse/purplepanda/pages/admin/demo.astro",
        });

        injectRoute({
          pattern: "/admin/pages",
          entrypoint: "@holtbosse/purplepanda/pages/admin/pages/index.astro",
        });

        injectRoute({
          pattern: "/admin/pages/new",
          entrypoint: "@holtbosse/purplepanda/pages/admin/pages/new.astro",
        });

        injectRoute({
          pattern: "/admin/pages/edit/[id]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/pages/new.astro",
        });

        injectRoute({
          pattern: "/admin/pages/update/",
          entrypoint: "@holtbosse/purplepanda/pages/admin/pages/update.ts",
        });

        injectRoute({
          pattern: "/admin/pages/update/[id]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/pages/update.ts",
        });

        injectRoute({
          pattern: "/admin/pages/toggle/[id]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/pages/toggle.ts",
        });

        injectRoute({
          pattern: "/admin/pages/bulk/[action]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/pages/bulk/[action].ts",
        });

        injectRoute({
          pattern: "/admin/templates",
          entrypoint: "@holtbosse/purplepanda/pages/admin/templates/index.astro",
        });

        injectRoute({
          pattern: "/admin/templates/new",
          entrypoint: "@holtbosse/purplepanda/pages/admin/templates/new.astro",
        });

        injectRoute({
          pattern: "/admin/templates/edit/[id]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/templates/new.astro",
        });

        injectRoute({
          pattern: "/admin/templates/update/",
          entrypoint: "@holtbosse/purplepanda/pages/admin/templates/update.ts",
        });

        injectRoute({
          pattern: "/admin/templates/update/[id]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/templates/update.ts",
        });

        injectRoute({
          pattern: "/admin/templates/toggle/[id]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/templates/toggle.ts",
        });

        injectRoute({
          pattern: "/admin/templates/bulk/[action]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/templates/bulk/[action].ts",
        });

        injectRoute({
          pattern: "/admin/drafts/create",
          entrypoint: "@holtbosse/purplepanda/pages/admin/drafts/create.ts",
        });

        injectRoute({
          pattern: "/admin/drafts/delete/[draftId]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/drafts/delete/[draftId].ts",
        });

        injectRoute({
          pattern: "/admin/pages/drafts/edit/[draftId]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/pages/drafts/edit/[draftId].astro",
        });

        injectRoute({
          pattern: "/admin/pages/drafts/update/[draftId]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/pages/drafts/update/[draftId].ts",
        });

        injectRoute({
          pattern: "/admin/pages/drafts/publish/[draftId]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/pages/drafts/publish/[draftId].ts",
        });

        injectRoute({
          pattern: "/admin/pages/preview/[draftId]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/pages/preview/[draftId].astro",
        });

        injectRoute({
          pattern: "/admin/pages/history/[id]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/pages/history/[id].astro",
        });

        injectRoute({
          pattern: "/admin/templates/history/[id]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/templates/history/[id].astro",
        });

        injectRoute({
          pattern: "/admin/profile",
          entrypoint: "@holtbosse/purplepanda/pages/admin/profile/index.astro",
        });

        injectRoute({
          pattern: "/admin/profile/update",
          entrypoint: "@holtbosse/purplepanda/pages/admin/profile/update.ts",
        });

        injectRoute({
          pattern: "/admin/users",
          entrypoint: "@holtbosse/purplepanda/pages/admin/users/index.astro",
        });

        injectRoute({
          pattern: "/admin/users/new",
          entrypoint: "@holtbosse/purplepanda/pages/admin/users/new.astro",
        });

        injectRoute({
          pattern: "/admin/users/edit/[id]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/users/new.astro",
        });

        injectRoute({
          pattern: "/admin/users/update/",
          entrypoint: "@holtbosse/purplepanda/pages/admin/users/update.ts",
        });

        injectRoute({
          pattern: "/admin/users/update/[id]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/users/update.ts",
        });

        injectRoute({
          pattern: "/admin/users/toggle/[id]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/users/toggle.ts",
        });

        injectRoute({
          pattern: "/admin/users/bulk/[action]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/users/bulk/[action].ts",
        });

        injectRoute({
          pattern: "/admin/users/roles",
          entrypoint: "@holtbosse/purplepanda/pages/admin/users/roles/index.astro",
        });

        injectRoute({
          pattern: "/admin/users/roles/new",
          entrypoint: "@holtbosse/purplepanda/pages/admin/users/roles/new.astro",
        });

        injectRoute({
          pattern: "/admin/users/roles/edit/[id]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/users/roles/new.astro",
        });

        injectRoute({
          pattern: "/admin/users/roles/update/",
          entrypoint: "@holtbosse/purplepanda/pages/admin/users/roles/update.ts",
        });

        injectRoute({
          pattern: "/admin/users/roles/update/[id]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/users/roles/update.ts",
        });

        injectRoute({
          pattern: "/admin/users/roles/toggle/[id]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/users/roles/toggle.ts",
        });

        injectRoute({
          pattern: "/admin/users/roles/bulk/[action]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/users/roles/bulk/[action].ts",
        });

        injectRoute({
          pattern: "/admin/media",
          entrypoint: "@holtbosse/purplepanda/pages/admin/media/index.astro",
        });

        injectRoute({
          pattern: "/admin/media/[id]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/media/index.astro",
        });
        
        injectRoute({
          pattern: "/admin/media/newfolder",
          entrypoint: "@holtbosse/purplepanda/pages/admin/media/newfolder.ts",
        });

        injectRoute({
          pattern: "/admin/media/upload",
          entrypoint: "@holtbosse/purplepanda/pages/admin/media/upload.ts",
        });

        injectRoute({
          pattern: "/admin/media/movemediatofolder",
          entrypoint: "@holtbosse/purplepanda/pages/admin/media/movemediatofolder.ts",
        });

        injectRoute({
          pattern: "/admin/media/delete",
          entrypoint: "@holtbosse/purplepanda/pages/admin/media/delete.ts",
        });

        injectRoute({
          pattern: "/admin/media/togglefoldervisibility/[id]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/media/togglefoldervisibility/[id].ts",
        });

        injectRoute({
          pattern: "/admin/media/api/lookup",
          entrypoint: "@holtbosse/purplepanda/pages/admin/media/api/lookup.ts",
        });

        injectRoute({
          pattern: "/admin/audit",
          entrypoint: "@holtbosse/purplepanda/pages/admin/audit/index.astro",
        });

        injectRoute({
          pattern: "/admin/settings",
          entrypoint: "@holtbosse/purplepanda/pages/admin/settings/index.astro",
        });

        injectRoute({
          pattern: "/admin/settings/update",
          entrypoint: "@holtbosse/purplepanda/pages/admin/settings/update.ts",
        });

        injectRoute({
          pattern: "/admin/settings/api/test-email",
          entrypoint: "@holtbosse/purplepanda/pages/admin/settings/api/test-email.ts",
        });

        injectRoute({
          pattern: "/admin/settings/prefab/default",
          entrypoint: "@holtbosse/purplepanda/pages/admin/settings/prefab/default.astro",
        });

        injectRoute({
          pattern: "/admin/settings/prefab/update",
          entrypoint: "@holtbosse/purplepanda/pages/admin/settings/prefab/update.ts",
        });

        injectRoute({
          pattern: "/admin/settings/prefab/update/[uuid]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/settings/prefab/update.ts",
        });

        injectRoute({
          pattern: "/admin/settings/prefab/history/default",
          entrypoint: "@holtbosse/purplepanda/pages/admin/settings/prefab/history/default.astro",
        });

        injectRoute({
          pattern: "/admin/settings/prefab/history/[uuid]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/settings/prefab/history/[uuid].astro",
        });

        injectRoute({
          pattern: "/admin/settings/prefab/[uuid]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/settings/prefab/[uuid].astro",
        });

        injectRoute({
          pattern: "/admin/components/data",
          entrypoint: "@holtbosse/purplepanda/pages/admin/components/data.ts",
        });

        injectRoute({
          pattern: "/admin/documents",
          entrypoint: "@holtbosse/purplepanda/pages/admin/documents/index.astro",
        });

        injectRoute({
          pattern: "/admin/documents/upload",
          entrypoint: "@holtbosse/purplepanda/pages/admin/documents/upload.ts",
        });

        injectRoute({
          pattern: "/admin/documents/update",
          entrypoint: "@holtbosse/purplepanda/pages/admin/documents/update.ts",
        });

        injectRoute({
          pattern: "/admin/documents/toggle/[id]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/documents/toggle.ts",
        });

        injectRoute({
          pattern: "/admin/documents/bulk/[action]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/documents/bulk/[action].ts",
        });

        injectRoute({
          pattern: "/document/[slug]",
          entrypoint: "@holtbosse/purplepanda/pages/document/[slug].ts",
        });

        injectRoute({
          pattern: "/admin/content/[id]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/content/index.astro",
        });

        injectRoute({
          pattern: "/admin/content/[typeId]/new",
          entrypoint: "@holtbosse/purplepanda/pages/admin/content/new.astro",
        });

        injectRoute({
          pattern: "/admin/content/[typeId]/edit/[id]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/content/new.astro",
        });

        injectRoute({
          pattern: "/admin/content/[typeId]/update/",
          entrypoint: "@holtbosse/purplepanda/pages/admin/content/update.ts",
        });

        injectRoute({
          pattern: "/admin/content/[typeId]/update/[id]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/content/update.ts",
        });

        injectRoute({
          pattern: "/admin/content/[typeId]/toggle/[id]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/content/toggle.ts",
        });

        injectRoute({
          pattern: "/admin/content/[typeId]/bulk/[action]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/content/bulk/[action].ts",
        });

        injectRoute({
          pattern: "/admin/content/drafts/edit/[draftId]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/content/drafts/edit/[draftId].astro",
        });

        injectRoute({
          pattern: "/admin/content/drafts/update/[draftId]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/content/drafts/update/[draftId].ts",
        });

        injectRoute({
          pattern: "/admin/content/drafts/publish/[draftId]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/content/drafts/publish/[draftId].ts",
        });

        injectRoute({
          pattern: "/admin/content/preview/[draftId]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/content/preview/[draftId].astro",
        });

        injectRoute({
          pattern: "/admin/content/history/[id]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/content/history/[id].astro",
        });

        injectRoute({
          pattern: "/admin/forms/api/lookup",
          entrypoint: "@holtbosse/purplepanda/pages/admin/forms/api/lookup.ts",
        });

        injectRoute({
          pattern: "/admin/forms",
          entrypoint: "@holtbosse/purplepanda/pages/admin/forms/index.astro",
        });

        injectRoute({
          pattern: "/admin/forms/new",
          entrypoint: "@holtbosse/purplepanda/pages/admin/forms/new.astro",
        });

        injectRoute({
          pattern: "/admin/forms/edit/[id]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/forms/new.astro",
        });

        injectRoute({
          pattern: "/admin/forms/update/",
          entrypoint: "@holtbosse/purplepanda/pages/admin/forms/update.ts",
        });

        injectRoute({
          pattern: "/admin/forms/update/[id]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/forms/update.ts",
        });

        injectRoute({
          pattern: "/admin/forms/toggle/[id]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/forms/toggle.ts",
        });

        injectRoute({
          pattern: "/admin/forms/history/[id]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/forms/history/[id].astro",
        });

        injectRoute({
          pattern: "/admin/forms/bulk/[action]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/forms/bulk/[action].ts",
        });

        injectRoute({
          pattern: "/admin/forms/submissions",
          entrypoint: "@holtbosse/purplepanda/pages/admin/forms/submissions/index.astro",
        });

        injectRoute({
          pattern: "/admin/forms/submissions/[id]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/forms/submissions/[id].astro",
        });

        injectRoute({
          pattern: "/admin/redirects",
          entrypoint: "@holtbosse/purplepanda/pages/admin/redirects/index.astro",
        });

        injectRoute({
          pattern: "/admin/redirects/new",
          entrypoint: "@holtbosse/purplepanda/pages/admin/redirects/new.astro",
        });

        injectRoute({
          pattern: "/admin/redirects/edit/[id]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/redirects/new.astro",
        });

        injectRoute({
          pattern: "/admin/redirects/update/",
          entrypoint: "@holtbosse/purplepanda/pages/admin/redirects/update.ts",
        });

        injectRoute({
          pattern: "/admin/redirects/update/[id]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/redirects/update.ts",
        });

        injectRoute({
          pattern: "/admin/redirects/toggle/[id]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/redirects/toggle.ts",
        });

        injectRoute({
          pattern: "/admin/redirects/bulk/[action]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/redirects/bulk/[action].ts",
        });

        injectRoute({
          pattern: "/admin/tags",
          entrypoint: "@holtbosse/purplepanda/pages/admin/tags/index.astro",
        });

        injectRoute({
          pattern: "/admin/tags/new",
          entrypoint: "@holtbosse/purplepanda/pages/admin/tags/new.astro",
        });

        injectRoute({
          pattern: "/admin/tags/edit/[id]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/tags/new.astro",
        });

        injectRoute({
          pattern: "/admin/tags/update/",
          entrypoint: "@holtbosse/purplepanda/pages/admin/tags/update.ts",
        });

        injectRoute({
          pattern: "/admin/tags/update/[id]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/tags/update.ts",
        });

        injectRoute({
          pattern: "/admin/tags/toggle/[id]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/tags/toggle.ts",
        });

        injectRoute({
          pattern: "/admin/tags/bulk/[action]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/tags/bulk/[action].ts",
        });

        injectRoute({
          pattern: "/admin/[...path]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/404.astro",
        });

        injectRoute({
          pattern: "/sitemap.xml",
          entrypoint: "@holtbosse/purplepanda/pages/sitemap.xml.ts",
        });

        injectRoute({
          pattern: "/[...path]",
          entrypoint: "@holtbosse/purplepanda/pages/page.astro",
        });

        injectRoute({
          pattern: "/image/[id]",
          entrypoint: "@holtbosse/purplepanda/pages/image/[id].ts",
        });

        injectRoute({
          pattern: "/purplepanda/forms/[id]/submit",
          entrypoint: "@holtbosse/purplepanda/pages/purplepanda/forms/[id]/submit.ts",
        });

        addMiddleware({
          entrypoint: "@holtbosse/purplepanda/middleware",
          order: "pre",
        });

        // Example: watch an external file to trigger dev reloads
        // addWatchFile(new URL("./some-file.txt", import.meta.url));
      },

      "astro:build:done": ({ dir, logger }) => {
        // if (options.enabled === false) return;

        const destDir = fileURLToPath(new URL("admin/assets/", dir));
        logger.info(`Copying admin assets to ${destDir}`);
        copyDir(assetsDir, destDir);
      },
    },
  };
}

//export function hello(name: string): string { return `Hello, ${name}` }