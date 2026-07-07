import type { Config, Data } from "@puckeditor/core";

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasDataResolver(value: unknown): value is { data: (fields: JsonObject) => unknown } {
  return isObject(value) && typeof value.data === "function";
}

function isSlotArray(value: unknown): value is JsonObject[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => isObject(entry) && typeof entry.type === "string" && isObject(entry.props))
  );
}

async function resolveItemForSSR(config: Partial<Config>, item: JsonObject): Promise<JsonObject> {
  const componentConfig = config.components?.[item.type as keyof NonNullable<typeof config.components>];
  let props = (item.props as JsonObject) ?? {};

  if (hasDataResolver(componentConfig)) {
    try {
      const resolved = await componentConfig.data(props);
      if (isObject(resolved)) props = { ...props, ...resolved };
    } catch {
      // ignore resolver failures, fall back to existing props
    }
  }

  const resolvedEntries = await Promise.all(
    Object.entries(props).map(async ([key, value]) => {
      if (isSlotArray(value)) {
        return [key, await Promise.all(value.map((child) => resolveItemForSSR(config, child)))] as const;
      }
      return [key, value] as const;
    })
  );

  return { ...item, props: Object.fromEntries(resolvedEntries) };
}

export async function resolveDataForSSR(config: Partial<Config>, data: Data): Promise<Data> {
  const resolvedContent = await Promise.all(
    (data.content ?? []).map((item) => resolveItemForSSR(config, item as JsonObject))
  );
  return { ...data, content: resolvedContent as Data["content"] };
}
