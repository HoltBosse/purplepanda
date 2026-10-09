import type { Config } from "@puckeditor/core";
import { readAiHint } from "./hint.js";

// The components an editor offers, written out as a compact reference for the AI assistant's
// prompt: each component's props with their types, choices and defaults, with this site's disabled
// components left out, so the assistant is offered exactly what the author's palette offers.
// Deterministic for a given config, which keeps the prompt cacheable.

type AnyField = {
  type?: string;
  label?: string;
  min?: number;
  max?: number;
  options?: { label?: string; value: unknown }[];
  arrayFields?: Record<string, AnyField>;
  objectFields?: Record<string, AnyField>;
};

const MAX_DEFAULT_LENGTH = 120;

function compactJson(value: unknown): string {
  const json = JSON.stringify(value);
  if (json === undefined) return "";
  return json.length > MAX_DEFAULT_LENGTH ? `${json.slice(0, MAX_DEFAULT_LENGTH)}…` : json;
}

function describeFields(fields: Record<string, AnyField>, defaults: Record<string, unknown> | undefined, indent: string): string[] {
  const lines: string[] = [];
  for (const [key, field] of Object.entries(fields)) {
    if (!field) continue;
    const label = field.label && field.label.toLowerCase() !== key.toLowerCase() ? ` "${field.label}"` : "";
    const fallback = defaults?.[key];
    const def = fallback !== undefined && field.type !== "slot" ? ` = ${compactJson(fallback)}` : "";
    const nested = field.type === "array" ? field.arrayFields : field.type === "object" || (field.type === "custom" && !readAiHint(field)) ? field.objectFields : undefined;
    lines.push(`${indent}- ${key}${label}: ${describeType(field, fallback)}${nested ? "" : def}`);
    if (nested) {
      const nestedDefaults = field.type === "array" ? (Array.isArray(fallback) ? fallback[0] : undefined) : fallback;
      lines.push(...describeFields(nested, nestedDefaults as Record<string, unknown> | undefined, `${indent}  `));
    }
  }
  return lines;
}

function describeType(field: AnyField, fallback: unknown): string {
  const bounds = [field.min !== undefined ? `min ${field.min}` : "", field.max !== undefined ? `max ${field.max}` : ""].filter(Boolean).join(", ");
  switch (field.type) {
    case "text":
      return "string";
    case "textarea":
      return "string (multi-line)";
    case "number":
      return bounds ? `number (${bounds})` : "number";
    case "richtext":
      return "HTML string (p, h1-h4, strong, em, s, u, ul/ol/li, a href, br, blockquote)";
    case "select":
    case "radio":
      return `one of ${(field.options ?? []).map((o) => compactJson(o.value)).join(" | ")}`;
    case "array":
      return "array of objects with:";
    case "object":
      return "object with:";
    case "slot":
      return "slot (child components — use add_components/move_component)";
    case "external":
      return "external reference (leave unchanged)";
    case "custom": {
      const hint = readAiHint(field);
      if (hint) return hint;
      if (field.objectFields) return "object with:";
      return fallback !== undefined ? "custom value shaped like its default" : "custom (leave unchanged)";
    }
    default:
      return field.type ?? "unknown";
  }
}

export type CatalogOptions = {
  // Components the site has turned off — still registered so existing content renders, but not
  // to be added.
  disabled?: ReadonlySet<string>;
};

// The page settings section: the editor's root fields. Only the browser knows these (each editor
// — pages, forms, each content type — sets its own), so the AI tab sends this part and the server
// builds the rest (see buildComponentCatalog).
export function buildRootCatalog(config: Config): string {
  const root = config.root as { fields?: Record<string, AnyField>; defaultProps?: Record<string, unknown> } | undefined;
  const rootLines = root?.fields ? describeFields(root.fields, root.defaultProps, "") : [];
  return `## root (page settings; update with id "root")\n${rootLines.length ? rootLines.join("\n") : "(no settings)"}`;
}

// The components section, built on the server from its own config, so the system prompt never
// carries text the browser supplied.
export function buildComponentCatalog(config: Config, { disabled }: CatalogOptions = {}): string {
  const sections: string[] = [];
  for (const [name, component] of Object.entries(config.components ?? {})) {
    if (disabled?.has(name)) continue;
    const label = component.label && component.label !== name ? ` "${component.label}"` : "";
    const lines = describeFields((component.fields ?? {}) as Record<string, AnyField>, component.defaultProps as Record<string, unknown> | undefined, "");
    sections.push(`## ${name}${label}\n${lines.length ? lines.join("\n") : "(no props)"}`);
  }
  return sections.join("\n\n");
}

export function buildCatalog(config: Config, options: CatalogOptions = {}): string {
  return [buildRootCatalog(config), buildComponentCatalog(config, options)].filter(Boolean).join("\n\n");
}
