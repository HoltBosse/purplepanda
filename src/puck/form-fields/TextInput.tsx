import type { ComponentConfig } from "@puckeditor/core";
import * as z from "zod";

export type TextInputProps = {
  label: string;
  description: string;
  inputType: "text" | "email" | "number" | "tel" | "url" | "password" | "date";
  placeholder: string;
  required: boolean;
};

// Empty string means "not filled in" for an optional field (the browser still submits the
// key for a blank text input), so it's normalized to undefined before the optional check.
const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

// email/url reject "" as an invalid format on their own, so required is enforced without a
// separate min(1) check; only the plain string-based branches need one.
function withRequired(schema: z.ZodString, required: boolean) {
  if (required) return schema.min(1, "Required");
  return z.preprocess(emptyToUndefined, schema.optional());
}

function toSubmissionSchema({ inputType, required }: TextInputProps) {
  switch (inputType) {
    case "email":
      return required ? z.email("Invalid email") : z.preprocess(emptyToUndefined, z.email("Invalid email").optional());
    case "url":
      return required ? z.url("Invalid URL") : z.preprocess(emptyToUndefined, z.url("Invalid URL").optional());
    case "number":
      // Kept as a regex-checked string (like date, below) rather than z.coerce.number(), since
      // Number("") coerces to 0 instead of failing, which would let a blank required field pass.
      return withRequired(z.string().regex(/^-?\d+(\.\d+)?$/, "Must be a number"), required);
    case "date":
      return withRequired(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"), required);
    default:
      return withRequired(z.string(), required);
  }
}

// Validates the field's own authored config (as set by whoever is building the form), not what an
// end user later submits into it — see toSubmissionSchema above for that.
function toPropsSchema() {
  return z.object({ label: z.string().trim().min(1, "Required") }).loose();
}

const TextInput: ComponentConfig<TextInputProps> = {
  label: "Text Input",
  locations: "form",
  toSubmissionSchema,
  propsSchema: toPropsSchema,
  fields: {
    label: { type: "text", label: "Label" },
    description: { type: "text", label: "Description (optional)" },
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
        { label: "Date", value: "date" },
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
    inputType: "text",
    placeholder: "",
    required: false,
  },
  render: ({ id, label, description, inputType, placeholder, required }) => {
    const name = `field-${id}`;
    return (
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
    );
  },
};

export default TextInput;
