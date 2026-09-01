import * as z from "zod";

// DateTimeField (see puck/component-fields/DateTimeField.tsx) only ever submits "" (unset) or a
// real `Date#toISOString()` result — z.iso.datetime() enforces exactly that shape (rejects
// non-UTC offsets, non-ISO strings, and invalid calendar dates like month 13).
const optionalUtcDateTime = z.union([z.literal(""), z.iso.datetime()]);

// CategoryObjectField (see puck/prefab/CategoryObjectField.tsx) stores its sub-fields as a plain
// object with no schema of its own, so the `og.image` shape is validated the same loose way
// media/ImagePicker.tsx validates its own required image: just enough to know it points at a
// real uploaded image, not the full ImageConfig (width/height/crop/etc. are cosmetic).
const ogImageSchema = z.object({ id: z.uuid() }).loose();

// Every page and content item needs a Title (shown in the page list and audit log) and an Alias
// (its URL path segment) to be usable, so both are required regardless of whatever else ends up
// in root.props (parentPage, other content-type fields, etc.). Plain pages get title/alias from
// PagePuckEditor.tsx's default `fields` branch; content types get them hardcoded into their
// rootConfig (see ContentPuckEditor.tsx) so they can't be overridden. Start/end/notes/og are
// hardcoded the same way, but stay optional (unset is a valid "always live"/note-free/no-OG-
// override state) — `og` is entirely optional since page.astro falls back to `title` when
// `og.title` is unset, and simply omits description/image when unset.
export function pageRootPropsSchema() {
  return z
    .object({
      title: z.string().trim().min(1, "Title is required"),
      alias: z.string().trim().min(1, "Alias is required"),
      start: optionalUtcDateTime.optional(),
      end: optionalUtcDateTime.optional(),
      notes: z.string().max(256, "Notes must be 256 characters or fewer").optional(),
      og: z
        .object({
          title: z.string().trim().max(60, "Open Graph title must be 60 characters or fewer").optional(),
          description: z
            .string()
            .trim()
            .max(160, "Open Graph description must be 160 characters or fewer")
            .optional(),
          image: ogImageSchema.nullable().optional(),
        })
        .loose()
        .optional(),
    })
    .loose();
}
