import * as z from "zod";
import type { Config, Data } from "@puckeditor/core";

type ComponentNode = { type: string; props: Record<string, unknown> };

// Puck stores nested children inline as arrays under `slot`-typed props (see Grid/Flex/Margin),
// rather than in a separate zones map, so a schema-less structural walk finds every component
// node without needing each parent's field definitions.
function collectComponentNodes(value: unknown, nodes: ComponentNode[] = []): ComponentNode[] {
  if (Array.isArray(value)) {
    for (const item of value) collectComponentNodes(item, nodes);
    return nodes;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.type === "string" && obj.props && typeof obj.props === "object") {
      nodes.push({ type: obj.type, props: obj.props as Record<string, unknown> });
      for (const propValue of Object.values(obj.props as Record<string, unknown>)) {
        collectComponentNodes(propValue, nodes);
      }
    }
  }
  return nodes;
}

// Builds the Zod schema a form's submitted data must satisfy, derived from the form's own
// stored Puck content rather than trusted client-side input. Components opt in via
// `toSubmissionSchema` (see puck/index.ts); components without it are left unvalidated so
// custom, non-field components (or future field types) don't get silently stripped.
export function buildFormSubmissionSchema(config: Config, data: Data): z.ZodObject<z.ZodRawShape> {
  const nodes = collectComponentNodes(data.content);
  collectComponentNodes((data.root as { props?: unknown })?.props, nodes);

  const shape: Record<string, z.ZodTypeAny> = {};
  for (const node of nodes) {
    const toSubmissionSchema = (config.components as Record<string, unknown> | undefined)?.[node.type] as
      | { toSubmissionSchema?: (props: Record<string, unknown>) => z.ZodTypeAny }
      | undefined;
    const id = node.props?.id;
    if (!toSubmissionSchema?.toSubmissionSchema || typeof id !== "string") continue;
    shape[`field-${id}`] = toSubmissionSchema.toSubmissionSchema(node.props);
  }

  // passthrough: fields without a validator (custom components, future honeypot/CSRF fields)
  // pass through unchecked rather than being stripped from the stored submission.
  return z.object(shape).passthrough();
}
