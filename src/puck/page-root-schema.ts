import * as z from "zod";

// Plain pages' root fields (see PagePuckEditor.tsx's default `fields` branch, used whenever no
// content-type `rootConfig` is supplied) — every page needs a Title (shown in the page list and
// audit log) and an Alias (its URL path segment) to be usable, so both are required regardless of
// whatever else ends up in root.props (parentPage, etc.). Not applied to content types, which
// define their own root fields entirely separately (see ContentPuckEditor.tsx).
export function pageRootPropsSchema() {
  return z
    .object({
      title: z.string().trim().min(1, "Title is required"),
      alias: z.string().trim().min(1, "Alias is required"),
    })
    .loose();
}
