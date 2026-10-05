import type { Config } from "@puckeditor/core";

// Per-site component availability. A component whose config sets `optIn: true` (see ./index.ts)
// is off on every site until a super admin enables it for that site under Admin → Sites, which
// stores its name in tenants.enabled_components. Every other component is on everywhere.
//
// Turning a component off stops new uses, not old ones: content that already contains it keeps
// rendering, the editors still draw it (so it can be removed) but leave it out of the palette, and
// validateContentTree (./validate-content.ts) refuses to save content that still contains it.

// Names of the components in `config` that have to be enabled per site.
export function optInComponentNames(config: Partial<Config>): string[] {
  return Object.entries(config.components ?? {})
    .filter(([, component]) => (component as { optIn?: unknown } | undefined)?.optIn === true)
    .map(([name]) => name);
}

// The opt-in components a site with `enabled` hasn't enabled.
export function disabledComponentNames(config: Partial<Config>, enabled: readonly string[]): Set<string> {
  const on = new Set(enabled);
  return new Set(optInComponentNames(config).filter((name) => !on.has(name)));
}

// The category the editors move disabled components into. Puck puts any component that's in no
// category into "Other", so they have to be in *some* category to stay out of the palette, and a
// hidden one keeps them out of sight while still letting existing instances render.
const DISABLED_CATEGORY = "__purplepandaDisabled";

// For the editors: `config` with `disabled` taken out of the palette but still registered, so
// content already using them still draws and can be selected and deleted.
export function hideDisabledComponents<TConfig extends Config>(config: TConfig, disabled: ReadonlySet<string>): TConfig {
  const present = Object.keys(config.components ?? {}).filter((name) => disabled.has(name));
  if (present.length === 0) return config;

  const categories: NonNullable<Config["categories"]> = {};
  for (const [name, category] of Object.entries(config.categories ?? {})) {
    if (!category.components) {
      categories[name] = category;
      continue;
    }
    const remaining = category.components.filter((component) => !disabled.has(component as string));
    if (remaining.length > 0 || category.components.length === 0) {
      categories[name] = { ...category, components: remaining };
    }
  }
  categories[DISABLED_CATEGORY] = { components: present, visible: false };

  return { ...config, categories };
}

// Injected into admin pages by components/SiteComponentsScript.astro, ahead of any editor island.
export const DISABLED_COMPONENTS_GLOBAL = "__PP_DISABLED_COMPONENTS";

type GlobalWithDisabledComponents = typeof globalThis & { __PP_DISABLED_COMPONENTS?: unknown };

// In the browser: the components the current site has turned off. Empty when nothing was injected
// (outside the admin, or in tests), so the editors then offer everything.
export function getInjectedDisabledComponents(): Set<string> {
  const injected = (globalThis as GlobalWithDisabledComponents).__PP_DISABLED_COMPONENTS;
  return new Set(Array.isArray(injected) ? injected.filter((name): name is string => typeof name === "string") : []);
}
