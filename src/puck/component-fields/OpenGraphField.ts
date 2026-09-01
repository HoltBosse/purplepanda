import type { Field } from "@puckeditor/core";
import { categoryField } from "../prefab/CategoryObjectField.js";
import { imageField } from "./ImageField.js";

// Shared by PagePuckEditor.tsx (plain pages) and ContentPuckEditor.tsx (content types) so both
// save the same `og: { title?, description?, image? }` shape under root.props — see page.astro
// for where these are read back out into <meta property="og:..."> tags, and page-root-schema.ts
// for the matching Zod limits (60/160 chars, mirrored in the field labels below).
export const ogField = categoryField(
  "Open Graph",
  {
    title: { type: "text", label: "Title" },
    description: { type: "textarea", label: "Description" },
    // The raw uploaded image is used as-is for og:image (see page.astro) — no need for the
    // crop/focus/sizing controls that matter when an image is actually laid out on the page.
    image: { ...imageField, minimal: true } as Field,
  },
  // Secondary/optional relative to the rest of root fields — collapsed on load so it doesn't
  // compete with title/alias/etc. for attention until someone actually wants to override it.
  { defaultExpanded: false },
);
