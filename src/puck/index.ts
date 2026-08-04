import type { Config, Field, Fields } from "@puckeditor/core";
import type * as z from "zod";
export { ClientComponentDataWrapper, wrapConfigWithClientDataResolvers } from "./client-data-wrapper.js";
export { wrapConfigWithDataBinding, ItemContext, useBoundItem } from "./data-binding.js";
export type { BoundItem } from "./data-binding.js";
export { wrapConfigWithIslands, ISLAND_NAME_ATTR, ISLAND_PROPS_ATTR } from "./islands.js";

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
  // context is the requesting page's Astro.locals, threaded through from page.astro via
  // resolveDataForSSR — lets a resolver read request-scoped state like session flash alerts.
  data?: (fields: DataFieldsForComponent<TComponent>, context?: App.Locals) => Awaitable<RenderArgsForComponent<TComponent>>;
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
  // For object-valued bound props (e.g. ImagePicker's `image`), lets a group of sub-keys be
  // pinned to a value the author sets directly — with its own field UI — instead of varying per
  // item. E.g. every image in a collection can share the same width/height even though the
  // image itself is bound per item. Once the prop is bound, a "same for every item?" toggle
  // appears below the "<field> source" dropdown; switching it on reveals `field` to set the
  // pinned value, which gets merged into the bound value at `keys` for every rendered item.
  overridable?: {
    label: string;
    // Sub-property names on the bound value that `field`'s value supplies.
    keys: string[];
    // Puck field used to edit the pinned value. Its own value shape should be an object
    // containing (at least) `keys`.
    field: Field;
  };
};

type ConfigWithDataResolvers<TConfig extends Config> = Omit<TConfig, "components"> & {
  components: {
    [TName in keyof TConfig["components"]]: ComponentWithDataResolver<TConfig["components"][TName]>;
  };
  contentTypes?: ContentType[];
  fontFamilies?: string[];
};

declare module "@puckeditor/core" {
  interface ComponentConfigExtensions {
    data?: (fields: any, context?: App.Locals) => Awaitable<Record<string, unknown>>;
    locations?: Location | Location[];
    bindableFields?: Record<string, BindableFieldMeta>;
    // When true, this component is hydrated as a standalone React island on the published front
    // end: its whole render output becomes interactive (hooks, effects, event handlers) while the
    // rest of the page stays static HTML. Its props must be JSON-serializable — no `slot` fields
    // or `ReactNode` props (those can't cross the server→client boundary). See ./islands.tsx.
    island?: boolean;
    // Server-side submission validation for form fields. Given this component's stored props,
    // returns the Zod schema its posted value must satisfy — keyed by `field-${id}` and combined
    // across a form's components by buildFormSubmissionSchema (./form-fields/schema.js). Only
    // components used as form fields need to implement this; others are left unvalidated.
    toSubmissionSchema?: (props: any) => z.ZodTypeAny;
    // Set to false to hide this field from the admin submissions viewer (packages/purplepanda/
    // src/pages/admin/forms/submissions/[id].astro) — for fields whose stored value isn't a
    // meaningful answer to show an admin, e.g. Turnstile's verification token. Defaults to shown.
    submissionDisplay?: boolean;
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
