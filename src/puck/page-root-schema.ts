import * as z from "zod";

// Every page and content item needs a Title (shown in the page list and audit log) and an Alias
// (its URL path segment) to be usable, so both are required regardless of whatever else ends up
// in root.props (parentPage, other content-type fields, etc.). Plain pages get title/alias from
// PagePuckEditor.tsx's default `fields` branch; content types get them hardcoded into their
// rootConfig (see ContentPuckEditor.tsx) so they can't be overridden.
export function pageRootPropsSchema() {
  return z
    .object({
      title: z.string().trim().min(1, "Title is required"),
      alias: z.string().trim().min(1, "Alias is required"),
    })
    .loose();
}
