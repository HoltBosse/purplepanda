import type { ComponentConfig } from "@puckeditor/core";

export type TextInputProps = {
  label: string;
  description: string;
  name: string;
  inputType: "text" | "email" | "number" | "tel" | "url" | "password";
  placeholder: string;
  required: boolean;
};

const TextInput: ComponentConfig<TextInputProps> = {
  label: "Text Input",
  locations: "form",
  fields: {
    label: { type: "text", label: "Label" },
    description: { type: "text", label: "Description (optional)" },
    name: { type: "text", label: "Field name" },
    inputType: {
      type: "select",
      label: "Input type",
      options: [
        { label: "Text", value: "text" },
        { label: "Email", value: "email" },
        { label: "Number", value: "number" },
        { label: "Phone", value: "tel" },
        { label: "URL", value: "url" },
        { label: "Password", value: "password" },
      ],
    },
    placeholder: { type: "text", label: "Placeholder" },
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
    name: "text-input",
    inputType: "text",
    placeholder: "",
    required: false,
  },
  render: ({ label, description, name, inputType, placeholder, required }) => (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium mb-1" htmlFor={name}>
          {label}
          {required && <span className="text-error ml-0.5">*</span>}
        </label>
      )}
      <input
        type={inputType}
        id={name}
        name={name}
        placeholder={placeholder}
        required={required}
        className="input input-bordered w-full"
      />
      {description && (
        <p className="text-sm text-base-content/60 mt-1">{description}</p>
      )}
    </div>
  ),
};

export default TextInput;
