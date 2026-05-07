import type { AstroIntegration } from "astro";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
import { extname, resolve, join } from "node:path";
import { existsSync, createReadStream, readdirSync, copyFileSync, mkdirSync } from "node:fs";

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

export default function purplePandaIntegration(options: { enabled?: boolean } = {}): AstroIntegration {
  // Resolves to src/assets/ relative to dist/index.js at runtime
  const assetsDir = fileURLToPath(new URL("../src/assets/", import.meta.url));

  return {
    name: "purple-panda",
    hooks: {
      "astro:config:setup": ({ updateConfig, injectScript, addWatchFile, addMiddleware, injectRoute, logger }) => {
        if (options.enabled === false) return;

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
          pattern: "/admin/profile",
          entrypoint: "@holtbosse/purplepanda/pages/admin/profile/index.astro",
        });

        injectRoute({
          pattern: "/admin/[...path]",
          entrypoint: "@holtbosse/purplepanda/pages/admin/404.astro",
        });

        addMiddleware({
          entrypoint: "@holtbosse/purplepanda/middleware",
          order: "pre",
        });

        // Example: watch an external file to trigger dev reloads
        // addWatchFile(new URL("./some-file.txt", import.meta.url));
      },

      "astro:build:done": ({ dir, logger }) => {
        if (options.enabled === false) return;

        const destDir = fileURLToPath(new URL("admin/assets/", dir));
        logger.info(`Copying admin assets to ${destDir}`);
        copyDir(assetsDir, destDir);
      },
    },
  };
}

//export function hello(name: string): string { return `Hello, ${name}` }