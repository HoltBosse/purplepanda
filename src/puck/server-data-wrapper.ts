import type { Config, Data } from "@puckeditor/core";

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasDataResolver(value: unknown): value is { data: (fields: JsonObject) => unknown } {
  return isObject(value) && typeof value.data === "function";
}

export async function resolveDataForSSR(config: Partial<Config>, data: Data): Promise<Data> {
  const resolvedContent = await Promise.all(
    (data.content ?? []).map(async (item) => {
      const componentConfig = config.components?.[item.type as keyof NonNullable<typeof config.components>];
      if (!hasDataResolver(componentConfig)) {
        return item;
      }
      try {
        const resolved = await componentConfig.data(item.props as JsonObject);
        if (!isObject(resolved)) return item;
        return { ...item, props: { ...item.props, ...resolved } };
      } catch {
        return item;
      }
    })
  );
  return { ...data, content: resolvedContent as Data["content"] };
}
