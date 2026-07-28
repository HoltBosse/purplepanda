import type { Config, Data } from "@puckeditor/core";

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasDataResolver(value: unknown): value is { data: (fields: JsonObject, context?: unknown) => unknown } {
  return isObject(value) && typeof value.data === "function";
}

function isSlotArray(value: unknown): value is JsonObject[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => isObject(entry) && typeof entry.type === "string" && isObject(entry.props))
  );
}

async function resolveItemForSSR(config: Partial<Config>, item: JsonObject, context?: unknown): Promise<JsonObject> {
  const componentConfig = config.components?.[item.type as keyof NonNullable<typeof config.components>];
  let props = (item.props as JsonObject) ?? {};

  if (hasDataResolver(componentConfig)) {
    try {
      const resolved = await componentConfig.data(props, context);
      if (isObject(resolved)) props = { ...props, ...resolved };
    } catch {
      // ignore resolver failures, fall back to existing props
    }
  }

  const resolvedEntries = await Promise.all(
    Object.entries(props).map(async ([key, value]) => {
      if (isSlotArray(value)) {
        return [key, await Promise.all(value.map((child) => resolveItemForSSR(config, child, context)))] as const;
      }
      return [key, value] as const;
    })
  );

  return { ...item, props: Object.fromEntries(resolvedEntries) };
}

// context (e.g. Astro.locals) flows through to every component's data() resolver, including
// those nested inside slots, so a component can read request-scoped state like session alerts.
export async function resolveDataForSSR(config: Partial<Config>, data: Data, context?: unknown): Promise<Data> {
  const resolvedContent = await Promise.all(
    (data.content ?? []).map((item) => resolveItemForSSR(config, item as JsonObject, context))
  );
  return { ...data, content: resolvedContent as Data["content"] };
}
