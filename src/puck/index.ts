import type { Config, Field, Fields } from "@puckeditor/core";
export { ClientComponentDataWrapper, wrapConfigWithClientDataResolvers } from "./client-data-wrapper.js";
export { wrapConfigWithDataBinding, ItemContext, useBoundItem } from "./data-binding.js";
export type { BoundItem } from "./data-binding.js";

export type { ComponentConfig, Slot } from "@puckeditor/core";

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

export type ContentType = {
  id: string;
  title: string,
  fields: Fields;
  baseUrl?: string;
};

// Declares a component's own prop as eligible for data-binding when the component is nested
// inside a CardCollection's card template. See ./data-binding.js for how this is consumed.
export type BindableFieldMeta = {
  label: string;
  // Restricts which content-type field kinds may be bound to this prop (matched against the
  // content type field's Puck `type`, e.g. "text" | "custom" | ...). Omit to allow any field.
  fieldTypes?: Field["type"][];
};

type ConfigWithDataResolvers<TConfig extends Config> = Omit<TConfig, "components"> & {
  components: {
    [TName in keyof TConfig["components"]]: ComponentWithDataResolver<TConfig["components"][TName]>;
  };
  contentTypes?: ContentType[];
};

declare module "@puckeditor/core" {
  interface ComponentConfigExtensions {
    data?: (fields: any) => Awaitable<Record<string, unknown>>;
    locations?: Location | Location[];
    bindableFields?: Record<string, BindableFieldMeta>;
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
