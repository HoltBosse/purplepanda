import type { CustomField } from "@puckeditor/core";
import { useEffect, useRef, useState } from "react";
// Order matters: slim-select's own base styles must land in the document before Select.css so
// Select.css's same-specificity `.ss-main`/`:root` overrides win the cascade — see the identical
// static-then-custom ordering in ../../form/fields/Select.astro. The `slim-select` JS module (the
// SlimSelect class itself) is still imported dynamically below, deferred until the field mounts.
import "slim-select/styles";
import "../../form/fields/Select.css";

export type UserOption = { id: string; label: string };

function NotifyUsersFieldInner({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string | undefined;
  value: string[] | null;
  onChange: (value: string[]) => void;
}) {
  const selectRef = useRef<HTMLSelectElement>(null);
  const [options, setOptions] = useState<UserOption[]>([]);
  const selected = value ?? [];

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

  // SlimSelect is (re)built once the user list has loaded, so its initial option set already
  // reflects who's selectable; the underlying native <select>'s selected attributes (set from
  // `selected` below) seed which of those are checked.
  // biome-ignore lint/correctness/useExhaustiveDependencies: onChange is a stable Puck callback; re-running this on every parent render would re-instantiate SlimSelect
  useEffect(() => {
    const select = selectRef.current;
    if (!select || options.length === 0) return;

    let instance: { destroy: () => void } | undefined;
    let cancelled = false;

    (async () => {
      const { default: SlimSelect } = await import("slim-select");
      if (cancelled || !selectRef.current) return;

      // SlimSelect copies the select's classes onto its own .ss-main box and the body-level
      // dropdown; clear them so the fallback "select" look doesn't leak through — the enhanced
      // widget's styling is owned entirely by Select.css (shared with the front-end field of the
      // same name), imported above.
      selectRef.current.className = "";

      instance = new SlimSelect({
        select: selectRef.current,
        settings: { placeholderText: "Select users to notify..." },
        events: {
          afterChange: (newValues) => onChange(newValues.map((item) => item.value)),
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
      {/* Puck doesn't auto-render a label for "custom" fields (unlike its built-in field
          types), so this field renders its own — see field.label passed in below. */}
      {label && (
        <label className="block text-sm font-medium mb-1" htmlFor={id}>
          {label}
        </label>
      )}
      <select ref={selectRef} id={id} multiple defaultValue={selected} className="select w-full">
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export const notifyUsersField: CustomField<string[]> = {
  type: "custom",
  label: "Notify users on submit",
  render: ({ field, id, value, onChange }) => (
    <NotifyUsersFieldInner id={id} label={field.label} value={value} onChange={onChange} />
  ),
};
