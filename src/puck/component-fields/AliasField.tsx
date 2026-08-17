import type { CustomField } from "@puckeditor/core";
import { Type } from "../icons.js";

// URL aliases only ever match [a-z-]; anything else (spaces, uppercase, punctuation) is
// normalized away as the user types so the stored value is always a valid path segment.
function sanitizeAlias(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z-]/g, "");
}

function AliasFieldInner({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string | undefined;
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  const isEmpty = !value;

  return (
    <div className="w-full">
      {/* Puck doesn't auto-render a label for "custom" fields (unlike its built-in field
          types), so this field renders its own — see field.label passed in below. The Type
          icon matches the one Puck's built-in "text" field type shows next to its own label
          (e.g. Title), so Alias reads as the same kind of field despite being a custom one. */}
      {label && (
        <label className="mb-1 flex items-center gap-1 text-sm font-medium" htmlFor={id}>
          <Type size={16} />
          {label}
        </label>
      )}
      <input
        type="text"
        id={id}
        className={`input input-bordered w-full ${isEmpty ? "border-error" : ""}`}
        value={value ?? ""}
        onChange={(e) => onChange(sanitizeAlias(e.currentTarget.value))}
      />
    </div>
  );
}

export const aliasField: CustomField<string> = {
  type: "custom",
  label: "Alias",
  render: ({ field, id, value, onChange }) => (
    <AliasFieldInner id={id} label={field.label} value={value} onChange={onChange} />
  ),
};
