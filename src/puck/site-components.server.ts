import type { Config } from "@puckeditor/core";
import { getDb } from "../db/db.js";
import externalPuckConfig from "../puck.config.js";
import { requireTenant } from "../tenant/context.js";
import { getEnabledComponents } from "../tenant/index.js";
import { disabledComponentNames } from "./site-components.js";

// The opt-in components the current request's site hasn't enabled: what every content-saving
// route passes to validateContentTree, what SiteComponentsScript.astro hands the editors, and
// what admin/components/data.ts refuses to resolve.
export async function getDisabledComponents(): Promise<Set<string>> {
  const enabled = await getEnabledComponents(getDb(), requireTenant().id);
  return disabledComponentNames((externalPuckConfig ?? {}) as Partial<Config>, enabled);
}
