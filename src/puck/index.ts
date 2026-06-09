import type { Config } from "@puckeditor/core";
export { ClientComponentDataWrapper, wrapConfigWithClientDataResolvers } from "./client-data-wrapper.js";

export type { ComponentConfig } from "@puckeditor/core";

type Awaitable<TValue> = TValue | Promise<TValue>;

export type Location = "template" | "form" | "page";

type DataFieldsForComponent<TComponent> = TComponent extends { defaultProps?: infer TDefaultProps }
  ? TDefaultProps
  : TComponent extends { render: (props: infer TRenderProps) => unknown }
    ? Partial<TRenderProps>
    : never;

type RenderArgsForComponent<TComponent> = TComponent extends { render: (props: infer TRenderProps) => unknown }
  ? Partial<TRenderProps>
  : never;

type ComponentWithDataResolver<TComponent> = Omit<TComponent, "data" | "locations"> & {
  data?: (fields: DataFieldsForComponent<TComponent>) => Awaitable<RenderArgsForComponent<TComponent>>;
  locations?: Location | Location[];
};

type ConfigWithDataResolvers<TConfig extends Config> = Omit<TConfig, "components"> & {
  components: {
    [TName in keyof TConfig["components"]]: ComponentWithDataResolver<TConfig["components"][TName]>;
  };
};

declare module "@puckeditor/core" {
  interface ComponentConfigExtensions {
    data?: (fields: any) => Awaitable<Record<string, unknown>>;
    locations?: Location | Location[];
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function componentMatchesLocation(component: unknown, location: Location): boolean {
  if (!isObject(component)) return true;
  const locs = component["locations"];
  if (locs === undefined || locs === null) return true;
  if (Array.isArray(locs)) return locs.length === 0 || locs.includes(location);
  return locs === location;
}

export function filterConfigByLocation(config: Config, location: Location): Config {
  const removedNames = new Set<string>();
  const filteredComponents: Config["components"] = {};

  for (const [name, comp] of Object.entries(config.components ?? {})) {
    if (componentMatchesLocation(comp, location)) {
      filteredComponents[name] = comp;
    } else {
      removedNames.add(name);
    }
  }

  if (removedNames.size === 0) return config;

  const filteredCategories: Config["categories"] = {};
  for (const [catName, cat] of Object.entries(config.categories ?? {})) {
    if (!cat.components || cat.components.length === 0) {
      filteredCategories[catName] = cat;
      continue;
    }
    const remaining = cat.components.filter((c) => !removedNames.has(c));
    if (remaining.length > 0) {
      filteredCategories[catName] = { ...cat, components: remaining };
    }
  }

  return {
    ...config,
    components: filteredComponents,
    categories: filteredCategories,
  };
}

export function definePuckConfig<TConfig extends Config>(config: ConfigWithDataResolvers<TConfig>): ConfigWithDataResolvers<TConfig> {
  return config;
}
