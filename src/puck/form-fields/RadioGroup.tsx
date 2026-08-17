import type { ComponentConfig } from "@puckeditor/core";
import * as z from "zod";

type RadioOption = {
  label: string;
  value: string;
};

export type RadioGroupProps = {
  label: string;
  description: string;
  options: RadioOption[];
  required: boolean;
};

// No option picked means the key is absent entirely (radios don't submit an empty value like
// text inputs do), so `.optional()` alone covers the not-required case.
function toSubmissionSchema({ options, required }: RadioGroupProps) {
  const values = options.map((option) => option.value);
  const optionSchema = values.length > 0 ? z.enum(values) : z.string();
  return required ? optionSchema : optionSchema.optional();
}

// Validates the field's own authored config, not what an end user later submits into it (see
// toSubmissionSchema above).
function toPropsSchema() {
  return z
    .object({
      label: z.string().trim().min(1, "Required"),
      options: z
        .array(z.object({ label: z.string().trim().min(1, "Required"), value: z.string().trim().min(1, "Required") }))
        .min(1, "At least one option is required"),
    })
    .loose();
}

const RadioGroup: ComponentConfig<RadioGroupProps> = {
  label: "Radio Group",
  locations: "form",
  toSubmissionSchema,
  propsSchema: toPropsSchema,
  fields: {
    label: { type: "text", label: "Label" },
    description: { type: "text", label: "Description (optional)" },
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
    options: [
      { label: "Option 1", value: "option-1" },
      { label: "Option 2", value: "option-2" },
    ],
    required: false,
  },
  render: ({ id, label, description, options, required }) => {
    const name = `field-${id}`;
    return (
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
    );
  },
};

export default RadioGroup;
