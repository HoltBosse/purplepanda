import type { PurplePandaPlugin } from "./hooks/index.js";

// Site-local plugins. Each one registers `on` listeners and/or `override` handlers against the
// hook names the code emits -- see hooks/index.ts for how they're dispatched, and docs/ for the
// hooks that exist.
const plugins: PurplePandaPlugin[] = [];

export default plugins;
