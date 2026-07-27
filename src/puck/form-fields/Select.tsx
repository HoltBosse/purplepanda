import type { ComponentConfig } from "@puckeditor/core";
import { useEffect, useRef } from "react";

type SelectOption = {
  label: string;
  value: string;
};

export type SelectProps = {
  label: string;
  description: string;
  placeholder: string;
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

const Select: ComponentConfig<SelectProps> = {
  label: "Select",
  // Hydrated as a front-end island so SlimSelect can enhance the native <select>. Props are all
  // JSON-serializable, which is required for whole-component islands (see src/puck/islands.tsx).
  island: true,
  locations: "form",
  fields: {
    label: { type: "text", label: "Label" },
    description: { type: "text", label: "Description (optional)" },
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
    options: [
      { label: "Option 1", value: "option-1" },
      { label: "Option 2", value: "option-2" },
    ],
    required: false,
    multiple: false,
  },
  render: ({ id, puck, ...props }: SelectProps & { id: string; puck?: { isEditing?: boolean } }) => (
    <SelectField {...props} id={id} editing={Boolean(puck?.isEditing)} />
  ),
};

export default Select;
