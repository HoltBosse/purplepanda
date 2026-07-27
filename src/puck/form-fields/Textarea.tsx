import type { ComponentConfig } from "@puckeditor/core";

export type TextareaProps = {
  label: string;
  description: string;
  placeholder: string;
  rows: number;
  required: boolean;
};

const Textarea: ComponentConfig<TextareaProps> = {
  label: "Textarea",
  locations: "form",
  fields: {
    label: { type: "text", label: "Label" },
    description: { type: "text", label: "Description (optional)" },
    placeholder: { type: "text", label: "Placeholder" },
    rows: { type: "number", label: "Rows", min: 2, max: 20 },
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
    placeholder: "",
    rows: 4,
    required: false,
  },
  render: ({ id, label, description, placeholder, rows, required }) => {
    const name = `field-${id}`;
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium mb-1" htmlFor={name}>
            {label}
            {required && <span className="text-error ml-0.5">*</span>}
          </label>
        )}
        <textarea
          id={name}
          name={name}
          placeholder={placeholder}
          rows={rows}
          required={required}
          className="textarea w-full"
        />
        {description && (
          <p className="text-sm text-base-content/60 mt-1">{description}</p>
        )}
      </div>
    );
  },
};

export default Textarea;
