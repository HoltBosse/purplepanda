import type { ComponentConfig, ComponentData, Config, Field } from "@puckeditor/core";
import type { Context } from "react";
import { createContext, useContext } from "react";
import type { BindableFieldMeta, ContentType } from "./index.js";

export type BoundItem = Record<string, unknown>;

// The item a repeated card/template instance is currently bound to. Set by CardCollection
// around each rendered copy of its cardTemplate slot; read by any component that declares
// `bindableFields` on itself (via the render wrapping below).
//
// Pinned to a globalThis singleton (keyed by a registry Symbol) rather than a plain module-level
// `createContext` call: this package is reachable from a consumer through more than one resolved
// module path (e.g. "@holtbosse/purplepanda/puck" vs a relative import from within
// "puck/prefab/CardCollection.js"), and in a symlinked workspace those can end up as two separate
// evaluations of this file. Two evaluations means two different context objects, and a Provider
// from one is invisible to a Consumer reading the other — the consumer silently falls back to the
// default (null) forever. `Symbol.for` + globalThis guarantees a single shared instance across
// however many times this module is evaluated, since they all run in the same JS realm.
const ITEM_CONTEXT_KEY = Symbol.for("@holtbosse/purplepanda/puck/ItemContext");
type GlobalWithItemContext = typeof globalThis & { [ITEM_CONTEXT_KEY]?: Context<BoundItem | null> };
const globalWithItemContext = globalThis as GlobalWithItemContext;
globalWithItemContext[ITEM_CONTEXT_KEY] ??= createContext<BoundItem | null>(null);
export const ItemContext: Context<BoundItem | null> = globalWithItemContext[ITEM_CONTEXT_KEY];

export function useBoundItem(): BoundItem | null {
  return useContext(ItemContext);
}

// The Puck component name that owns a `contentType` prop and a card-template slot. Any
// component whose immediate parent is this type is considered "inside a collection" for the
// purposes of data-binding; the marker prop below relays that fact through further nesting.
export const CARD_COLLECTION_COMPONENT_NAME = "CardCollection";

// Hidden prop name used to relay "which content type is this nested under" down through
// container components (Flex, Grid, or anything else with a slot) without those components
// needing to know anything about data-binding themselves. Never rendered as a field.
const INHERITED_CONTENT_TYPE_PROP = "__ppInheritedContentType";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function inferContentTypeId(parent: ComponentData | null | undefined): string | undefined {
  if (!parent) return undefined;
  const props = parent.props as Record<string, unknown> | undefined;

  if (parent.type === CARD_COLLECTION_COMPONENT_NAME && isNonEmptyString(props?.contentType)) {
    return props.contentType;
  }

  const inherited = props?.[INHERITED_CONTENT_TYPE_PROP];
  return isNonEmptyString(inherited) ? inherited : undefined;
}

function fieldOptionsForContentType(contentType: ContentType, meta: BindableFieldMeta) {
  return Object.entries(contentType.fields ?? {})
    .filter(([, field]) => !meta.fieldTypes || meta.fieldTypes.includes((field as Field).type))
    .map(([fieldName, field]) => ({
      label: (field as Field).label || fieldName,
      value: fieldName,
    }));
}

function bindingFieldName(propName: string): string {
  return `bind_${propName}`;
}

// Field name for the "same for every item?" toggle for an object-valued bound prop's overridable
// group (e.g. `override_image`). Only injected once the prop itself is bound.
function overrideToggleFieldName(propName: string): string {
  return `override_${propName}`;
}

// Field name for the pinned override value itself (e.g. `override_image_value`), rendered with
// `meta.overridable.field`'s own UI. Only injected once the toggle above is switched on.
function overrideValueFieldName(propName: string): string {
  return `override_${propName}_value`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Wraps every component in a config so that:
//  - any component declaring `bindableFields` gets a `bind_<prop>` select injected once it's
//    nested (at any depth) inside a CardCollection's card template, populated from that
//    collection's selected content type
//  - at render time, a bound prop's value is swapped for the current item's field value (read
//    from ItemContext, provided by CardCollection around each repeated card)
//  - the "which content type is this under" fact is relayed through arbitrary container
//    nesting automatically, so authors of container components (Flex, Grid, ...) never have to
//    opt in themselves
//
// This mirrors wrapConfigWithClientDataResolvers/resolveDataForSSR: components declare intent
// via a plain property, and a single function processes the whole config once.
export function wrapConfigWithDataBinding(config: Config): Config {
  const contentTypes: ContentType[] = (config as unknown as { contentTypes?: ContentType[] }).contentTypes ?? [];

  const wrappedComponents: Config["components"] = {};
  for (const [name, componentConfig] of Object.entries(config.components ?? {})) {
    wrappedComponents[name] = wrapComponent(componentConfig as ComponentConfig, contentTypes);
  }

  return {
    ...config,
    components: wrappedComponents,
  };
}

function wrapComponent(componentConfig: ComponentConfig, contentTypes: ContentType[]): ComponentConfig {
  const bindable = (componentConfig as { bindableFields?: Record<string, BindableFieldMeta> }).bindableFields;
  const originalResolveFields = componentConfig.resolveFields;
  const originalResolveData = componentConfig.resolveData;
  const originalRender = componentConfig.render;

  return {
    ...componentConfig,

    resolveFields: async (data, params) => {
      const baseFields = originalResolveFields
        ? await originalResolveFields(data, params)
        : (componentConfig.fields ?? {});

      if (!bindable || Object.keys(bindable).length === 0) return baseFields;

      const contentTypeId = inferContentTypeId(params.parent);
      const contentType = contentTypeId ? contentTypes.find((ct) => ct.id === contentTypeId) : undefined;
      if (!contentType) return baseFields;

      const currentProps = (data.props ?? {}) as Record<string, unknown>;
      const bindingFields: Record<string, Field> = {};
      for (const [propName, meta] of Object.entries(bindable)) {
        bindingFields[bindingFieldName(propName)] = {
          type: "select",
          label: `${meta.label} source`,
          options: [{ label: "— static value —", value: "" }, ...fieldOptionsForContentType(contentType, meta)],
        } as Field;

        const isBound = isNonEmptyString(currentProps[bindingFieldName(propName)]);
        if (isBound && meta.overridable) {
          bindingFields[overrideToggleFieldName(propName)] = {
            type: "radio",
            label: `${meta.overridable.label}: same for every item?`,
            options: [
              { label: "Use each item's value", value: "" },
              { label: "Same for every item", value: "template" },
            ],
          } as Field;

          if (currentProps[overrideToggleFieldName(propName)] === "template") {
            bindingFields[overrideValueFieldName(propName)] = meta.overridable.field;
          }
        }
      }

      return { ...baseFields, ...bindingFields };
    },

    resolveData: async (data, params) => {
      const base = originalResolveData ? await originalResolveData(data, params) : { props: data.props };
      const inheritedId = inferContentTypeId(params.parent);
      const currentProps = (base.props ?? data.props) as Record<string, unknown>;

      if (currentProps[INHERITED_CONTENT_TYPE_PROP] === inheritedId) {
        return base;
      }

      // Set the marker when entering/changing a collection's card template, and clear it again
      // (rather than leaving it stale) once the component is moved back out — otherwise a
      // component dragged out of a collection would keep offering bind_* fields for a content
      // type it's no longer nested under.
      const nextProps = { ...currentProps };
      if (inheritedId) {
        nextProps[INHERITED_CONTENT_TYPE_PROP] = inheritedId;
      } else {
        delete nextProps[INHERITED_CONTENT_TYPE_PROP];
      }

      return { ...base, props: nextProps };
    },

    render: (props: Record<string, unknown>) => {
      if (!bindable || Object.keys(bindable).length === 0) {
        return originalRender(props as never);
      }

      // biome-ignore lint/correctness/useHookAtTopLevel: `bindable` is fixed per component config (module-load time), so this branch is stable across renders of any given component's render function; it's not a per-render conditional
      const item = useContext(ItemContext);
      if (!item) return originalRender(props as never);

      const resolved: Record<string, unknown> = { ...props };
      for (const [propName, meta] of Object.entries(bindable)) {
        const boundFieldName = props[bindingFieldName(propName)];
        if (!isNonEmptyString(boundFieldName) || !Object.hasOwn(item, boundFieldName)) {
          continue;
        }

        const boundValue = item[boundFieldName];
        const overrideValue = props[overrideValueFieldName(propName)];
        const overrideOn = meta.overridable && props[overrideToggleFieldName(propName)] === "template";

        if (overrideOn && isPlainObject(boundValue) && isPlainObject(overrideValue)) {
          const merged = { ...boundValue };
          for (const key of meta.overridable!.keys) {
            if (Object.hasOwn(overrideValue, key)) {
              merged[key] = overrideValue[key];
            }
          }
          resolved[propName] = merged;
        } else {
          resolved[propName] = boundValue;
        }
      }

      return originalRender(resolved as never);
    },
  };
}
