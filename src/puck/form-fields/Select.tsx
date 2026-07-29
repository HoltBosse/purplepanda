import type { ComponentConfig, Fields } from "@puckeditor/core";
import { useEffect, useRef } from "react";
import * as z from "zod";

export type SelectOption = {
  label: string;
  value: string;
};

export type OptionsSource = "manual" | "content" | "users";

export type SelectProps = {
  label: string;
  description: string;
  placeholder: string;
  source: OptionsSource;
  contentType: string;
  options: SelectOption[];
  required: boolean;
  multiple: boolean;
};

type SelectFieldProps = SelectProps & { id: string; editing: boolean };

function SelectField({
  id,
  label,
  description,
  placeholder,
  options,
  required,
  multiple,
  editing,
}: SelectFieldProps) {
  const name = `field-${id}`;
  const selectRef = useRef<HTMLSelectElement>(null);

  // SlimSelect enhances the native <select> once the island is hydrated on the front end. It's
  // skipped while editing (the base render still runs inside the form editor, where we want a plain
  // native select). SlimSelect and its styles are imported dynamically so nothing browser-only is
  // evaluated during server rendering (getFormHtml renders this component with renderToStaticMarkup).
  useEffect(() => {
    if (editing) return;
    const select = selectRef.current;
    if (!select) return;

    let instance: { destroy: () => void } | undefined;
    let cancelled = false;

    (async () => {
      const [{ default: SlimSelect }] = await Promise.all([
        import("slim-select"),
        import("slim-select/styles"),
      ]);
      if (cancelled || !selectRef.current) return;

      // SlimSelect copies the select's classes onto its own box and dropdown; clear them so the
      // enhanced widget uses SlimSelect's own styling rather than leaking the daisyUI select look
      // (which is only meant for the native fallback shown before hydration).
      selectRef.current.className = "";

      instance = new SlimSelect({
        select: selectRef.current,
        settings: placeholder ? { placeholderText: placeholder } : {},
      });
    })();

    return () => {
      cancelled = true;
      instance?.destroy();
    };
  }, [editing, placeholder, multiple, options]);

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium mb-1" htmlFor={name}>
          {label}
          {required && <span className="text-error ml-0.5">*</span>}
        </label>
      )}
      <select
        ref={selectRef}
        id={name}
        name={name}
        required={required}
        multiple={multiple}
        className="select select-bordered w-full"
        defaultValue={multiple ? [] : ""}
      >
        {placeholder && !multiple && (
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
  );
}

// The stored "options" prop only ever reflects the manual source — for content/users it's
// whatever was left over from before the source was switched (that field is hidden from the
// editor once source !== "manual"; see resolveFields below), never the live list. So content/users
// can't be checked against a static enum the way manual can; each posted value is instead checked
// against the real source with an async DB lookup (isUserOptionValid/isContentOptionValid).
function buildOptionSchema({ source, contentType, options }: SelectProps): z.ZodTypeAny {
  if (source === "users") {
    return z.string().refine(async (value) => {
      const { isUserOptionValid } = await import("./Select.server.js");
      return isUserOptionValid(value);
    }, "Invalid option");
  }

  if (source === "content") {
    return z.string().refine(async (value) => {
      if (!contentType) return false;
      const { isContentOptionValid } = await import("./Select.server.js");
      return isContentOptionValid(contentType, value);
    }, "Invalid option");
  }

  const values = options.map((option) => option.value);
  return values.length > 0 ? z.enum(values) : z.string();
}

// A multi-select with nothing chosen (or single-select unselected, if not required) omits the
// key entirely, same as checkboxes/radios; formDataToJson only yields an array once 2+ values
// are posted, so a lone selection still needs normalizing into an array for the `multiple` case.
function toSubmissionSchema(props: SelectProps) {
  const { required, multiple } = props;
  const optionSchema = buildOptionSchema(props);

  if (multiple) {
    const arraySchema = z.preprocess(
      (value) => (value === undefined ? [] : Array.isArray(value) ? value : [value]),
      z.array(optionSchema),
    );
    return required ? arraySchema.refine((selected) => selected.length > 0, "Required") : arraySchema;
  }

  return required ? optionSchema : optionSchema.optional();
}

// Imported dynamically, only when actually needed (inside resolveFields, below), rather than at
// module scope: this component is registered as part of the same virtual:purplepanda/puck-config
// that's still busy loading it (see the identical comment in ../prefab/CardCollection.tsx), and a
// static top-level import also can't resolve outside a real Astro/vite build — e.g. under plain
// vitest, which imports this module directly (see form/schema.test.ts).
async function getContentTypeOptions() {
  const { default: externalPuckConfig } = await import("virtual:purplepanda/puck-config");
  return (externalPuckConfig?.contentTypes ?? []).map((contentType) => ({
    label: contentType.title,
    value: contentType.id,
  }));
}

const optionsField: Fields<SelectProps>["options"] = {
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
};

const contentTypeField: Fields<SelectProps>["contentType"] = {
  type: "select",
  label: "Content type",
  options: [{ label: "— select a content type —", value: "" }],
};

const Select: ComponentConfig<SelectProps> = {
  label: "Select",
  // Hydrated as a front-end island so SlimSelect can enhance the native <select>. Props are all
  // JSON-serializable, which is required for whole-component islands (see src/puck/islands.tsx).
  island: true,
  locations: "form",
  toSubmissionSchema,
  fields: {
    label: { type: "text", label: "Label" },
    description: { type: "text", label: "Description (optional)" },
    placeholder: { type: "text", label: "Placeholder option" },
    source: {
      type: "select",
      label: "Options source",
      options: [
        { label: "Manual", value: "manual" },
        { label: "Content", value: "content" },
        { label: "Users", value: "users" },
      ],
    },
    contentType: contentTypeField,
    options: optionsField,
    required: {
      type: "radio",
      label: "Required",
      options: [
        { label: "Yes", value: true },
        { label: "No", value: false },
      ],
    },
    multiple: {
      type: "radio",
      label: "Allow multiple",
      options: [
        { label: "Yes", value: true },
        { label: "No", value: false },
      ],
    },
  },
  defaultProps: {
    label: "Label",
    description: "",
    placeholder: "Select an option",
    source: "manual",
    contentType: "",
    options: [
      { label: "Option 1", value: "option-1" },
      { label: "Option 2", value: "option-2" },
    ],
    required: false,
    multiple: false,
  },
  // Only the field(s) relevant to the chosen source are shown: "options" (manual entry) for
  // manual, "contentType" for content — users needs no further picker, since there's only one
  // users list to draw from.
  resolveFields: async (data, { fields }) => {
    const { source } = data.props;
    const resolved: Partial<Fields<SelectProps>> = {
      label: fields.label,
      description: fields.description,
      placeholder: fields.placeholder,
      source: fields.source,
    };

    if (source === "content") {
      resolved.contentType = {
        ...contentTypeField,
        options: [{ label: "— select a content type —", value: "" }, ...(await getContentTypeOptions())],
      };
    } else if (source !== "users") {
      resolved.options = optionsField;
    }

    resolved.required = fields.required;
    resolved.multiple = fields.multiple;

    return resolved as Fields<SelectProps>;
  },
  // Resolves the actual runtime options from the chosen source. Only content/users need a server
  // round-trip (published pages via resolveDataForSSR, the editor via /admin/components/data —
  // see client-data-wrapper.tsx); manual sources are used as authored and need no resolution.
  data: async ({ source, contentType }: SelectProps) => {
    if (!import.meta.env.SSR) return {};
    if (source === "users") {
      const { getUserOptions } = await import("./Select.server.js");
      return { options: await getUserOptions() };
    }
    if (source === "content") {
      if (!contentType) return { options: [] };
      const { getContentOptions } = await import("./Select.server.js");
      return { options: await getContentOptions(contentType) };
    }
    return {};
  },
  render: ({ id, puck, ...props }: SelectProps & { id: string; puck?: { isEditing?: boolean } }) => (
    <SelectField {...props} id={id} editing={Boolean(puck?.isEditing)} />
  ),
};

export default Select;
