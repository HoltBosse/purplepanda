import type { ComponentConfig, Config } from "@puckeditor/core";
import type { PurplePandaPlugin } from "../hooks/index.js";

// What a private site module adds to this install: components (usually `optIn: true`, so only the
// sites they're built for get them — see ../puck/site-components.ts), categories to file them
// under, and plugins. It lives outside this repository and is compiled in at build time through
// the `purplepanda:site` import; see ./resolve.ts for where it's looked for, and
// docs/devs/site-components for the private-repo setup.
export interface PurplePandaSite {
  components?: Record<string, ComponentConfig<any>>;
  categories?: Config["categories"];
  plugins?: PurplePandaPlugin[];
  // Font stylesheet URLs, added to puck.config's own (see admin/settings).
  fontFamilies?: string[];
}

export function defineSite(site: PurplePandaSite): PurplePandaSite {
  return site;
}
