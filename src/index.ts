import type { AstroIntegration } from "astro";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { setDb } from "./db/db.js";
import { setMediaPath } from "./media/media.js";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { extname, resolve, join } from "node:path";
import { existsSync, createReadStream, readdirSync, statSync, copyFileSync, mkdirSync } from "node:fs";

const VIRTUAL_PUCK_CONFIG_ID = "virtual:purplepanda/puck-config";
const RESOLVED_VIRTUAL_PUCK_CONFIG_ID = `\0${VIRTUAL_PUCK_CONFIG_ID}`;

export interface PurplePandaIntegrationOptions {
  enabled?: boolean;
  db?: NodePgDatabase<Record<string, unknown>>;
  mediaPath?: string;
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
                  if (id === VIRTUAL_PUCK_CONFIG_ID) {
                    return RESOLVED_VIRTUAL_PUCK_CONFIG_ID;
                  }

                  return null;
                },
                load(id) {
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
          pattern: "/admin/templates",
          entrypoint: "@holtbosse/purplepanda/pages/admin/templates/index.astro",
        });

        injectRoute({
          pattern: "/admin/templates/new",
          entrypoint: "@holtbosse/purplepanda/pages/admin/templates/new.astro",
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
          pattern: "/admin/components/data",
          entrypoint: "@holtbosse/purplepanda/pages/admin/components/data.ts",
        });

        injectRoute({
          pattern: "/admin/[...path]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/404.astro",
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