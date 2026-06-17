import type { AstroIntegration } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { setDb } from "./db/db.js";
import { setMediaPath } from "./media/media.js";
import { setDocumentPath } from "./document/document.js";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { extname, resolve, join } from "node:path";
import { existsSync, createReadStream, readdirSync, statSync, copyFileSync, mkdirSync } from "node:fs";

const VIRTUAL_PUCK_CONFIG_ID = "virtual:purplepanda/puck-config";
const RESOLVED_VIRTUAL_PUCK_CONFIG_ID = `\0${VIRTUAL_PUCK_CONFIG_ID}`;

const VIRTUAL_HAS_404_ID = "virtual:purplepanda/has-404";
const RESOLVED_VIRTUAL_HAS_404_ID = `\0${VIRTUAL_HAS_404_ID}`;

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
      "astro:config:setup": ({ updateConfig, injectScript, addWatchFile, addMiddleware, injectRoute, logger, config }) => {
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

        // Example: inject a script into every page (runs in the browser)
        injectScript("page", `console.log("[purple-panda] loaded");`);

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
                  return null;
                },
                load(id) {
                  if (id === RESOLVED_VIRTUAL_HAS_404_ID) {
                    return `export const has404Page = ${has404Page};`;
                  }

                  if (id !== RESOLVED_VIRTUAL_PUCK_CONFIG_ID) {
                    return null;
                  }

                  if (!options.puckConfigModule) {
                    return "export default {};";
                  }

                  const rootDir = fileURLToPath(config.root);
                  const modulePath = options.puckConfigModule.startsWith(".")
                    ? resolve(rootDir, options.puckConfigModule)
                    : options.puckConfigModule;

                  return `export { default } from ${JSON.stringify(modulePath)};`;
                },
                configureServer(server) {
                  server.middlewares.use("/admin/assets", (req, res, next) => {
                    const urlPath = (req.url ?? "/").split("?")[0];
                    const safePath = resolve(assetsDir, "." + urlPath);

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
          pattern: "/admin/settings",
          entrypoint: "@holtbosse/purplepanda/pages/admin/settings/index.astro",
        });

        injectRoute({
          pattern: "/admin/settings/update",
          entrypoint: "@holtbosse/purplepanda/pages/admin/settings/update.ts",
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
          pattern: "/admin/forms/bulk/[action]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/forms/bulk/[action].ts",
        });

        injectRoute({
          pattern: "/admin/forms/submissions",
          entrypoint: "@holtbosse/purplepanda/pages/admin/forms/submissions.astro",
        });

        injectRoute({
          pattern: "/admin/[...path]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/404.astro",
        });

        injectRoute({
          pattern: "/[...path]",
          entrypoint: "@holtbosse/purplepanda/pages/page.astro",
        });

        injectRoute({
          pattern: "/image/[id]",
          entrypoint: "@holtbosse/purplepanda/pages/image/[id].ts",
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