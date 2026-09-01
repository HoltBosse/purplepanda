import type { CustomField } from "@puckeditor/core";

const MAX_LENGTH = 256;

function NotesFieldInner({
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
  const length = value?.length ?? 0;

  return (
    <div className="w-full">
      {/* Puck doesn't auto-render a label for "custom" fields (unlike its built-in field
          types), so this field renders its own — see field.label passed in below. */}
      {label && (
        <label className="mb-1 flex items-center justify-between text-sm font-medium" htmlFor={id}>
          <span>{label}</span>
          <span className="font-normal text-base-content/50">{length}/{MAX_LENGTH}</span>
        </label>
      )}
      <textarea
        id={id}
        className="textarea textarea-bordered w-full"
        maxLength={MAX_LENGTH}
        value={value ?? ""}
        onChange={(e) => onChange(e.currentTarget.value)}
      />
    </div>
  );
}

export const notesField: CustomField<string> = {
  type: "custom",
  label: "Notes",
  render: ({ field, id, value, onChange }) => (
    <NotesFieldInner id={id} label={field.label} value={value} onChange={onChange} />
  ),
};
