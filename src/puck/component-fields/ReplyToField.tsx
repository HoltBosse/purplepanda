import type { CustomField } from "@puckeditor/core";
import { useEffect, useRef, useState } from "react";
// Same static-then-custom stylesheet ordering as NotifyUsersField/Select.astro — see the comment
// there for why it matters.
import "slim-select/styles";
import "../../form/fields/Select.css";
import type { UserOption } from "./NotifyUsersField.js";

function ReplyToFieldInner({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string | undefined;
  value: string | null;
  onChange: (value: string) => void;
}) {
  const selectRef = useRef<HTMLSelectElement>(null);
  const [options, setOptions] = useState<UserOption[]>([]);
  const selected = value ?? "";

  useEffect(() => {
    let cancelled = false;
    fetch("/admin/users/api/lookup", { credentials: "same-origin" })
      .then((res) => (res.ok ? (res.json() as Promise<UserOption[]>) : []))
      .then((data) => {
        if (!cancelled) setOptions(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: onChange is a stable Puck callback, and `selected` is only read for the initial data below — re-running this every time the user picks a value would destroy and rebuild SlimSelect out from under itself
  useEffect(() => {
    const select = selectRef.current;
    if (!select || options.length === 0) return;

    let instance: { destroy: () => void } | undefined;
    let cancelled = false;

    (async () => {
      const { default: SlimSelect } = await import("slim-select");
      if (cancelled || !selectRef.current) return;

      // See NotifyUsersField for why classes are cleared here — SlimSelect copies the select's
      // classes onto its own chrome, and styling is owned entirely by Select.css.
      selectRef.current.className = "";

      instance = new SlimSelect({
        select: selectRef.current,
        // Passed as `data` (rather than relying on the <select>'s rendered <option> children)
        // so the initially-selected user is applied atomically with the option list — the
        // options only exist once the async fetch above resolves, by which point the native
        // select's uncontrolled defaultValue has already committed with nothing to match.
        // The explicit placeholder option is required for "nothing selected" to be
        // representable at all: a native <select> always has some option selected, and without
        // this one present in the initial data, the browser defaults that to the first real
        // user rather than leaving the field blank.
        data: [
          { text: "", value: "", placeholder: true, selected: !selected },
          ...options.map((opt) => ({ text: opt.label, value: opt.id, selected: opt.id === selected })),
        ],
        settings: { placeholderText: "Select a user...", allowDeselect: true },
        events: {
          afterChange: (newValues) => onChange(newValues[0]?.value ?? ""),
        },
      });
    })();

    return () => {
      cancelled = true;
      instance?.destroy();
    };
  }, [options]);

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium mb-1" htmlFor={id}>
          {label}
        </label>
      )}
      <select ref={selectRef} id={id} className="select w-full" />
    </div>
  );
}

export const replyToField: CustomField<string> = {
  type: "custom",
  label: "Reply-to",
  render: ({ field, id, value, onChange }) => (
    <ReplyToFieldInner id={id} label={field.label} value={value} onChange={onChange} />
  ),
};
