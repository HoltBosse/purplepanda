import { existsSync } from "node:fs";
import { resolve } from "node:path";

export const SITE_MODULE_ID = "purplepanda:site";

const ENTRY_FILES = ["index.ts", "index.tsx", "index.js", "index.jsx"];

function findEntry(dir: string): string | undefined {
  return ENTRY_FILES.map((file) => resolve(dir, file)).find((path) => existsSync(path));
}

// The file `purplepanda:site` resolves to, worked out once when the build (or dev server) starts:
//   1. PURPLEPANDA_SITE_DIR, relative to the project root — and it's an error if it has no index
//      file, so a misconfigured build fails instead of quietly shipping without its components;
//   2. else ./sites, if there is one (gitignored, for a private repo checked out or copied there);
//   3. else ./src/site/empty.ts, which adds nothing.
// Keep the directory inside the project root, so its imports resolve against the project's own
// node_modules.
export function resolveSiteModule(root: string, siteDir: string | undefined = process.env.PURPLEPANDA_SITE_DIR): string {
  if (siteDir) {
    const dir = resolve(root, siteDir);
    const entry = findEntry(dir);
    if (!entry) {
      throw new Error(`[purplepanda] PURPLEPANDA_SITE_DIR is ${siteDir}, but ${dir} has no ${ENTRY_FILES.join("/")}`);
    }
    return entry;
  }
  return findEntry(resolve(root, "sites")) ?? resolve(root, "src/site/empty.ts");
}
