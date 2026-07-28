import type { ComponentConfig } from "@puckeditor/core";
import * as z from "zod";

export type CheckboxProps = {
  label: string;
  description: string;
  checkboxLabel: string;
  required: boolean;
};

// An unchecked box isn't included in the submitted form data at all (the key is absent, not
// empty), and a checked box's value defaults to "on" since no explicit `value` is rendered.
function toSubmissionSchema({ required }: CheckboxProps) {
  return required ? z.literal("on", "Required") : z.literal("on").optional();
}

const Checkbox: ComponentConfig<CheckboxProps> = {
  label: "Checkbox",
  locations: "form",
  toSubmissionSchema,
  fields: {
    label: { type: "text", label: "Label" },
    description: { type: "text", label: "Description (optional)" },
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
    checkboxLabel: "I agree",
    required: false,
  },
  render: ({ id, label, description, checkboxLabel, required }) => {
    const name = `field-${id}`;
    return (
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
    );
  },
};

export default Checkbox;
