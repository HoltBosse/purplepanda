import type { ComponentConfig } from "@puckeditor/core";

export type CheckboxProps = {
  label: string;
  description: string;
  name: string;
  checkboxLabel: string;
  required: boolean;
};

const Checkbox: ComponentConfig<CheckboxProps> = {
  label: "Checkbox",
  locations: "form",
  fields: {
    label: { type: "text", label: "Label" },
    description: { type: "text", label: "Description (optional)" },
    name: { type: "text", label: "Field name" },
    checkboxLabel: { type: "text", label: "Checkbox label" },
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
    label: "Label",
    description: "",
    name: "checkbox",
    checkboxLabel: "I agree",
    required: false,
  },
  render: ({ label, description, name, checkboxLabel, required }) => (
    <div className="w-full">
      {label && (
        <p className="block text-sm font-medium mb-1">
          {label}
          {required && <span className="text-error ml-0.5">*</span>}
        </p>
      )}
      <label className="flex items-center gap-2 cursor-pointer" htmlFor={name}>
        <input
          type="checkbox"
          id={name}
          name={name}
          required={required}
          className="checkbox"
        />
        <span className="text-sm">{checkboxLabel}</span>
      </label>
      {description && (
        <p className="text-sm text-base-content/60 mt-1">{description}</p>
      )}
    </div>
  ),
};

export default Checkbox;
