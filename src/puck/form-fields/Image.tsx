import type { ComponentConfig } from "@puckeditor/core";
import * as z from "zod";
import { folderField, type MediaFolderRef } from "../media/FolderPicker.js";

export type ImageProps = {
  label: string;
  description: string;
  required: boolean;
  folder: MediaFolderRef | null;
};

// By the time this runs, processSubmission below has already replaced the posted file with the
// media row it created (or left the field undefined if none was uploaded) — this validates that
// resulting shape, not the raw upload itself (see Image.server.ts for the file/content checks).
const mediaRefSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  alt: z.string(),
});

function toSubmissionSchema({ required }: ImageProps) {
  return required ? mediaRefSchema : mediaRefSchema.optional();
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const Image: ComponentConfig<ImageProps> = {
  label: "Image Upload",
  locations: "form",
  toSubmissionSchema,
  processSubmission: async (raw, props) => {
    // Dynamically imported so the server-only sharp/fs/db code in Image.server.js never gets
    // pulled into the client editor bundle that also imports this component (see Turnstile.tsx
    // for the same pattern).
    const { processImageSubmission } = await import("./Image.server.js");
    return processImageSubmission(raw, props);
  },
  // The stored value is a { id, title, alt } media reference (see processSubmission above) — far
  // more useful to an admin reviewing submissions as an actual thumbnail than printed as an
  // object. `id` is a schema-validated uuid and `alt`/`title` are already restricted to
  // letters/numbers/spaces (see Image.server.ts's titleFromFilename), but both are still escaped
  // here since this string is injected as raw HTML by the submissions viewer.
  renderSubmissionValue: (value) => {
    const ref = value as { id?: string; title?: string; alt?: string } | null | undefined;
    if (!ref?.id) return "";
    const alt = escapeHtml(ref.alt || ref.title || "Uploaded image");
    const title = escapeHtml(ref.title || "");
    return (
      `<a href="/image/${ref.id}" target="_blank" rel="noopener noreferrer">` +
      `<img src="/image/${ref.id}?fmt=webp&w=200&q=80" alt="${alt}" title="${title}" ` +
      `class="max-h-32 max-w-full rounded border border-base-300 object-contain" /></a>`
    );
  },
  fields: {
    label: { type: "text", label: "Label" },
    description: { type: "text", label: "Description (optional)" },
    folder: { ...folderField, label: "Destination folder" },
    required: {
      type: "radio",
      label: "Required",
      options: [
        { label: "Yes", value: true },
        { label: "No", value: false },
      ],
    },
  },
  defaultProps: {
    label: "Upload an image",
    description: "",
    required: false,
    folder: null,
  },
  render: ({ id, label, description, required, folder }) => {
    const name = `field-${id}`;
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium mb-1" htmlFor={name}>
            {label}
            {required && <span className="text-error ml-0.5">*</span>}
          </label>
        )}
        <input
          type="file"
          accept="image/*"
          id={name}
          name={name}
          required={required}
          className="file-input file-input-bordered w-full"
        />
        {description && (
          <p className="text-sm text-base-content/60 mt-1">{description}</p>
        )}
        {!folder && (
          <p className="text-sm text-error mt-1">
            This field isn&apos;t configured with a destination folder yet.
          </p>
        )}
      </div>
    );
  },
};

export default Image;
