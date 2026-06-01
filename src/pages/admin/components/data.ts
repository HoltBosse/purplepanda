import type { APIContext } from "astro";
import type { Config } from "@puckeditor/core";
import externalPuckConfig from "virtual:purplepanda/puck-config";

type JsonObject = Record<string, unknown>;

type DataRequestBody = {
  component?: string;
  fields?: JsonObject;
};

function json(data: JsonObject, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasDataResolver(value: unknown): value is { data: (fields: JsonObject) => unknown } {
  return isObject(value) && typeof value.data === "function";
}

export async function POST(context: APIContext): Promise<Response> {
  let body: DataRequestBody;

  try {
    body = (await context.request.json()) as DataRequestBody;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const componentName = body.component;
  if (!componentName || typeof componentName !== "string") {
    return json({ error: "Missing or invalid 'component'" }, 400);
  }

  const fields = isObject(body.fields) ? body.fields : {};
  const config: Partial<Config> = externalPuckConfig ?? {};
  const component = config.components?.[componentName as keyof NonNullable<typeof config.components>];

  if (!component) {
    return json({ error: `Component '${componentName}' not found` }, 404);
  }

  if (!hasDataResolver(component)) {
    return json({ error: `Component '${componentName}' does not define a data resolver` }, 400);
  }

  try {
    const result = await component.data(fields);
    if (!isObject(result)) {
      return json({ error: `Component '${componentName}' data resolver must return an object` }, 500);
    }

    return json({ component: componentName, data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to resolve component data";
    return json({ error: message }, 500);
  }
}
