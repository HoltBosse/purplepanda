import type { Config, Field, Fields } from "@puckeditor/core";
import type { Thing } from "schema-dts";
import type * as z from "zod";

export type { ComponentConfig, Slot } from "@puckeditor/core";
export { ClientComponentDataWrapper, wrapConfigWithClientDataResolvers } from "./client-data-wrapper.js";
export type { BoundItem } from "./data-binding.js";
export { ItemContext, useBoundItem, wrapConfigWithDataBinding } from "./data-binding.js";
export { ISLAND_NAME_ATTR, ISLAND_PROPS_ATTR, IslandRenderContext, wrapConfigWithIslands } from "./islands.js";
export { pageRootPropsSchema } from "./page-root-schema.js";
export type { ContentValidationError, ValidateContentTreeOptions } from "./validate-content.js";
export { formatValidationErrors, validateContentTree } from "./validate-content.js";

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
  // Builds this content type's structured-data (JSON-LD) representation from a page's resolved
  // root props (i.e. its `fields` values). Returns a schema.org `Thing` minus `@context`, which
  // page.astro adds and serializes into a `<script type="application/ld+json">` tag. Omit to skip
  // structured data for this content type.
  jsonLd?: (props: any) => Thing | undefined;
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
    // Validates this component's own authored props (the values an editor set in the Puck side
    // panel — label text, URLs, selected options, etc.), as opposed to toSubmissionSchema below
    // (which validates what an end user *posts* into a rendered form). Given this component's
    // stored props, returns the Zod schema they must satisfy; run against the whole props object
    // via validateContentTree (./validate-content.js), which both the editor (before Save/
    // Publish — see PuckEditor.tsx) and every content-persisting API route call so a component
    // can't be saved half-configured from either surface. Puck's own Field config has no
    // required/format validation of its own (no `required` flag, no pattern/min-length), so this
    // is the only place "is this field required" and "does it pass this Zod rule" are enforced.
    // Components without it are left unvalidated. Return a `.loose()` object
    // schema so fields you don't care about (id, unrelated props) don't fail validation.
    propsSchema?: (props: any) => z.ZodTypeAny;
    // Server-side submission validation for form fields. Given this component's stored props,
    // returns the Zod schema its posted value must satisfy — keyed by `field-${id}` and combined
    // across a form's components by buildFormSubmissionSchema (./form-fields/schema.js). Only
    // components used as form fields need to implement this; others are left unvalidated.
    toSubmissionSchema?: (props: any) => z.ZodTypeAny;
    // For a form field whose posted value needs a server-side side effect before it's stored —
    // writing an uploaded file to disk, inserting a DB row, calling an external API — rather than
    // being stored as posted. Given the raw FormData value(s) for this field (before the
    // File→{name,size,type} metadata collapse `submit.ts` applies to build the plain submission
    // object) and this component's own stored props, returns the value to store in the
    // submission's `data` JSON in its place; that value is what toSubmissionSchema above then
    // validates. Only runs once a submission has already passed spam/CSRF checks (see submit.ts),
    // so a rejected bot submission never triggers the side effect. Throw to reject the submission
    // with a field-specific error message. Components without this hook have their posted value
    // stored as-is (subject only to toSubmissionSchema). See form-fields/Image.tsx for an example.
    processSubmission?: (
      raw: FormDataEntryValue | FormDataEntryValue[] | undefined,
      props: any,
      context?: App.Locals,
    ) => Promise<unknown>;
    // Set to false to hide this field from the admin submissions viewer (packages/purplepanda/
    // src/pages/admin/forms/submissions/[id].astro) — for fields whose stored value isn't a
    // meaningful answer to show an admin, e.g. Turnstile's verification token. Defaults to shown.
    submissionDisplay?: boolean;
    // Custom rendering of this field's stored submission value in the admin submissions viewer,
    // for values the viewer's default text formatting wouldn't render usefully — e.g. Image.tsx's
    // persisted { id, title, alt } media reference is far more useful shown as a thumbnail than
    // printed as an object. Given the stored value and this component's own props, returns an
    // HTML string the viewer injects as-is (so it must already be safe/escaped); omit to fall
    // back to the viewer's default formatting.
    renderSubmissionValue?: (value: unknown, props: any) => string | Promise<string>;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function componentMatchesLocation(component: unknown, location: Location): boolean {
  if (!isObject(component)) return true;
  const locs = component.locations;
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
