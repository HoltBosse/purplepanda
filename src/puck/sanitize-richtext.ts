import type { Config, Data, Fields } from "@puckeditor/core";
import { walkTree } from "@puckeditor/core";

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Puck renders a `richtext` prop through a lazily loaded tiptap renderer, and until that chunk has
// loaded (the first server render in each process, and every first paint in the browser) its
// Suspense fallback injects the stored string verbatim via dangerouslySetInnerHTML. Stored rich
// text is whatever the saving request sent, so every render path runs it through a sanitizer
// before handing the data to Puck. Mirrors Puck's own richtext-key discovery (use-richtext-props):
// richtext fields directly on the component or nested in array/object fields.
export function sanitizeRichtextProps(
  fields: Fields | undefined,
  props: JsonObject,
  sanitize: (html: string) => string,
): JsonObject {
  if (!fields) return props;
  let out: JsonObject | undefined;
  const set = (key: string, value: unknown) => {
    out ??= { ...props };
    out[key] = value;
  };

  for (const [key, field] of Object.entries(fields)) {
    const value = props[key];
    if (field.type === "richtext" && typeof value === "string") {
      set(key, sanitize(value));
    } else if (field.type === "array" && "arrayFields" in field && Array.isArray(value)) {
      set(
        key,
        value.map((entry) => (isObject(entry) ? sanitizeRichtextProps(field.arrayFields as Fields, entry, sanitize) : entry)),
      );
    } else if (field.type === "object" && "objectFields" in field && isObject(value)) {
      set(key, sanitizeRichtextProps(field.objectFields as Fields, value, sanitize));
    }
  }
  return out ?? props;
}

// Sanitizes every component's richtext props throughout a Puck data tree (slots included), plus
// the root's.
export function sanitizeRichtextData(config: Config, data: Data, sanitize: (html: string) => string): Data {
  const walked = walkTree(data, config, (content) =>
    content.map((item) => {
      const fields = config.components?.[item.type]?.fields as Fields | undefined;
      return { ...item, props: sanitizeRichtextProps(fields, item.props as JsonObject, sanitize) } as typeof item;
    }),
  );
  if (!isObject(walked.root?.props)) return walked;
  return {
    ...walked,
    root: { ...walked.root, props: sanitizeRichtextProps(config.root?.fields as Fields | undefined, walked.root.props, sanitize) },
  } as Data;
}
