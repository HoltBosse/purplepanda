import type { ComponentConfig } from "@puckeditor/core";

type SelectOption = {
  label: string;
  value: string;
};

export type SelectProps = {
  label: string;
  description: string;
  name: string;
  placeholder: string;
  options: SelectOption[];
  required: boolean;
};

const Select: ComponentConfig<SelectProps> = {
  label: "Select",
  locations: "form",
  fields: {
    label: { type: "text", label: "Label" },
    description: { type: "text", label: "Description (optional)" },
    name: { type: "text", label: "Field name" },
    placeholder: { type: "text", label: "Placeholder option" },
    options: {
      type: "array",
      label: "Options",
      arrayFields: {
        label: { type: "text", label: "Label" },
        value: { type: "text", label: "Value" },
      },
      defaultItemProps: {
        label: "Option",
        value: "option",
      },
    },
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
    name: "select",
    placeholder: "Select an option",
    options: [
      { label: "Option 1", value: "option-1" },
      { label: "Option 2", value: "option-2" },
    ],
    required: false,
  },
  render: ({ label, description, name, placeholder, options, required }) => (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium mb-1" htmlFor={name}>
          {label}
          {required && <span className="text-error ml-0.5">*</span>}
        </label>
      )}
      <select
        id={name}
        name={name}
        required={required}
        className="select select-bordered w-full"
        defaultValue=""
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {description && (
        <p className="text-sm text-base-content/60 mt-1">{description}</p>
      )}
    </div>
  ),
};

export default Select;
