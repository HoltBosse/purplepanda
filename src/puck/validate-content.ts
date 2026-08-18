import type { Config, Data } from "@puckeditor/core";
import * as z from "zod";
import { collectComponentNodes } from "./content-tree.js";

export type ContentValidationError = {
  componentId: string;
  componentType: string;
  field: string;
  message: string;
};

// Shape-checks a plugin's content:validate override return value (see ../hooks/index.js) against
// this same type, since that hook's result crosses a plugin/host boundary with no compiler
// enforcement on the plugin's side.
export const contentValidationErrorsSchema = z.array(
  z.object({
    componentId: z.string(),
    componentType: z.string(),
    field: z.string(),
    message: z.string(),
  }),
);

export type ValidateContentTreeOptions = {
  // Root fields (data.root.props) aren't declared by a purplepanda component — they're set per
  // host/entity (e.g. PagePuckEditor's default title/alias/parentPage fields, see
  // ./page-root-schema.js), so there's no propsSchema to look up on a component config for them.
  // Pass one explicitly to also validate root.props alongside the component tree below.
  rootPropsSchema?: ((props: Record<string, unknown>) => z.ZodTypeAny) | undefined;
};

// Validates every component instance in a page/content/form/prefab's Puck tree against its own
// `propsSchema` (see ./index.js), the same way buildFormSubmissionSchema (./form/schema.js)
// validates submitted form values against `toSubmissionSchema` — just one level up, checking what
// an editor configured rather than what an end user posted. Components without `propsSchema` are
// left unvalidated.
export function validateContentTree(
  config: Partial<Config>,
  data: Data,
  options?: ValidateContentTreeOptions,
): ContentValidationError[] {
  const nodes = collectComponentNodes(data.content);
  const errors: ContentValidationError[] = [];

  for (const node of nodes) {
    const component = (config.components as Record<string, unknown> | undefined)?.[node.type] as
      | { propsSchema?: (props: Record<string, unknown>) => z.ZodTypeAny }
      | undefined;
    if (!component?.propsSchema) continue;

    const result = component.propsSchema(node.props).safeParse(node.props);
    if (result.success) continue;

    const componentId = typeof node.props?.id === "string" ? node.props.id : node.type;
    for (const issue of result.error.issues) {
      errors.push({
        componentId,
        componentType: node.type,
        field: issue.path.length > 0 ? issue.path.join(".") : "(component)",
        message: issue.message,
      });
    }
  }

  if (options?.rootPropsSchema) {
    const rootProps = (data.root as { props?: Record<string, unknown> } | undefined)?.props ?? {};
    const result = options.rootPropsSchema(rootProps).safeParse(rootProps);
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push({
          componentId: "root",
          componentType: "Page",
          field: issue.path.length > 0 ? issue.path.join(".") : "(page)",
          message: issue.message,
        });
      }
    }
  }

  return errors;
}

export function formatValidationErrors(errors: ContentValidationError[]): string {
  return errors.map((error) => `${error.componentType} — ${error.field}: ${error.message}`).join("; ");
}
