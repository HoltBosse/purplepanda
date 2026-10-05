import site from "purplepanda:site";
import type { PurplePandaPlugin } from "./hooks/index.js";

// Site-local plugins. Each one registers `on` listeners and/or `override` handlers against the
// hook names the code emits -- see hooks/index.ts for how they're dispatched, and docs/ for the
// hooks that exist. The private site module's plugins (see src/site/resolve.ts) run after these.
const plugins: PurplePandaPlugin[] = [...(site.plugins ?? [])];

export default plugins;
