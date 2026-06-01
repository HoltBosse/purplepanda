import type { Config } from "@puckeditor/core";
import type { ReactElement } from "react";
import { useEffect, useMemo, useState } from "react";

type JsonObject = Record<string, unknown>;

type ClientComponentDataWrapperProps = {
  componentName: string;
  fields: JsonObject;
  render: (props: any) => ReactElement;
  endpoint: string;
};

type DataResponse = {
  data?: JsonObject;
};

// Cache prevents duplicate calls for identical component+field payloads in a session.
const responseCache = new Map<string, JsonObject>();

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toSerializable(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => toSerializable(item, seen))
      .filter((item) => item !== undefined);
  }

  if (isObject(value)) {
    if (seen.has(value)) {
      return undefined;
    }

    seen.add(value);
    const out: JsonObject = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      const safeValue = toSerializable(nestedValue, seen);
      if (safeValue !== undefined) {
        out[key] = safeValue;
      }
    }
    return out;
  }

  return undefined;
}

function toSerializableObject(value: unknown): JsonObject {
  const safeValue = toSerializable(value, new WeakSet<object>());
  return isObject(safeValue) ? safeValue : {};
}

export function ClientComponentDataWrapper({ componentName, fields, render, endpoint }: ClientComponentDataWrapperProps) {
  const [resolvedData, setResolvedData] = useState<JsonObject>({});

  const requestFields = useMemo(() => toSerializableObject(fields), [fields]);
  const cacheKey = useMemo(() => `${componentName}:${JSON.stringify(requestFields)}`, [componentName, requestFields]);

  useEffect(() => {
    let isCancelled = false;

    if (responseCache.has(cacheKey)) {
      setResolvedData(responseCache.get(cacheKey) ?? {});
      return;
    }

    async function resolveData() {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          credentials: "same-origin",
          body: JSON.stringify({
            component: componentName,
            fields: requestFields,
          }),
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as DataResponse;
        if (!isObject(payload.data)) {
          return;
        }

        responseCache.set(cacheKey, payload.data);
        if (!isCancelled) {
          setResolvedData(payload.data);
        }
      } catch {
        // Ignore data resolver failures and continue rendering with original props.
      }
    }

    resolveData();

    return () => {
      isCancelled = true;
    };
  }, [cacheKey, componentName, endpoint, requestFields]);

  const mergedProps = useMemo(() => {
    return {
      ...fields,
      ...resolvedData,
    };
  }, [fields, resolvedData]);

  return render(mergedProps);
}

type DataAwareComponent = {
  data?: (fields: Record<string, unknown>) => unknown;
  render: (props: any) => ReactElement;
};

function isDataAwareComponent(value: unknown): value is DataAwareComponent {
  return isObject(value) && typeof value.render === "function" && typeof value.data === "function";
}

export function wrapConfigWithClientDataResolvers(config: Config, endpoint = "/admin/components/data"): Config {
  const wrappedComponents: Config["components"] = {};

  for (const [componentName, componentConfig] of Object.entries(config.components ?? {})) {
    if (!isDataAwareComponent(componentConfig)) {
      wrappedComponents[componentName] = componentConfig;
      continue;
    }

    const originalRender = componentConfig.render;
    wrappedComponents[componentName] = {
      ...componentConfig,
      render: (props: Record<string, unknown>) => {
        return (
          <ClientComponentDataWrapper
            componentName={componentName}
            fields={props}
            render={originalRender}
            endpoint={endpoint}
          />
        );
      },
    };
  }

  return {
    ...config,
    components: wrappedComponents,
  };
}