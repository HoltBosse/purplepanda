import type { CustomField } from "@puckeditor/core";

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
  return (
    <div className="w-full">
      {/* Puck doesn't auto-render a label for "custom" fields (unlike its built-in field
          types), so this field renders its own — see field.label passed in below. */}
      {label && (
        <label className="block text-sm font-medium mb-1" htmlFor={id}>
          {label}
        </label>
      )}
      <input
        type="text"
        id={id}
        className="input input-bordered w-full"
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
