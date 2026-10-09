import { formRootPropsSchema } from "../form-root-schema.js";
import { pageRootPropsSchema } from "../page-root-schema.js";

// The page-level (root props) schemas the editors validate against, by name, so the AI tab can tell
// the server which one its editor uses and the server can validate the assistant's edits to page
// settings the same way the editor's Save/Publish check will. An editor with a schema not listed
// here sends null; its page settings are then checked only in the editor.
export const ROOT_SCHEMAS = {
  page: pageRootPropsSchema,
  form: formRootPropsSchema,
} as const;

export type RootSchemaName = keyof typeof ROOT_SCHEMAS;

export function rootSchemaName(schema: unknown): RootSchemaName | null {
  const entry = Object.entries(ROOT_SCHEMAS).find(([, candidate]) => candidate === schema);
  return entry ? (entry[0] as RootSchemaName) : null;
}
