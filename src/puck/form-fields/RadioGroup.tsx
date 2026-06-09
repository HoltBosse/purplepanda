import type { ComponentConfig } from "@puckeditor/core";

type RadioOption = {
  label: string;
  value: string;
};

export type RadioGroupProps = {
  label: string;
  description: string;
  name: string;
  options: RadioOption[];
  required: boolean;
};

const RadioGroup: ComponentConfig<RadioGroupProps> = {
  label: "Radio Group",
  locations: "form",
  fields: {
    label: { type: "text", label: "Label" },
    description: { type: "text", label: "Description (optional)" },
    name: { type: "text", label: "Field name" },
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
    name: "radio-group",
    options: [
      { label: "Option 1", value: "option-1" },
      { label: "Option 2", value: "option-2" },
    ],
    required: false,
  },
  render: ({ label, description, name, options, required }) => (
    <div className="w-full">
      {label && (
        <p className="block text-sm font-medium mb-1">
          {label}
          {required && <span className="text-error ml-0.5">*</span>}
        </p>
      )}
      <div className="flex flex-col gap-1">
        {options.map((opt) => (
          <label
            key={opt.value}
            className="flex items-center gap-2 cursor-pointer"
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              required={required}
              className="radio"
            />
            <span className="text-sm">{opt.label}</span>
          </label>
        ))}
      </div>
      {description && (
        <p className="text-sm text-base-content/60 mt-1">{description}</p>
      )}
    </div>
  ),
};

export default RadioGroup;
