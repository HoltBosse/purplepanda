import { type ReactNode, useState } from "react";
import { Lock, Plus, Trash2 } from "../../puck/icons.js";
import { colorHex, type Ref, ROLE_LABELS, ROLES, type Theme, units } from "../../theme/index.js";

// Small building blocks shared by the theme screen's tabs.

export function Panel({ title, description, action, children }: { title: string; description?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="p-5 sm:p-6 bg-base-100 rounded-lg mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h2 className="text-lg font-medium">{title}</h2>
          {description && <p className="text-sm text-base-content/60 mt-1 max-w-prose">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

// A color's light and dark values side by side.
export function Swatch({ theme, id }: { theme: Theme; id: string }) {
  return (
    <span className="inline-flex w-7 h-5 rounded overflow-hidden border border-base-300 shrink-0" aria-hidden="true">
      <span className="flex-1" style={{ background: colorHex(theme, id, "light") }} />
      <span className="flex-1" style={{ background: colorHex(theme, id, "dark") }} />
    </span>
  );
}

export function ColorSelect({
  theme,
  value,
  onChange,
  label,
  id,
  className = "select select-sm w-full min-w-0",
}: {
  theme: Theme;
  value: string;
  onChange: (id: string) => void;
  label: string;
  id?: string;
  className?: string;
}) {
  return (
    <select id={id} className={className} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {theme.colors.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

// "Match the section" picks one of the surrounding scheme's roles; "Always this color" a fixed one.
export function RefSelect({
  theme,
  value,
  onChange,
  label,
  id,
  none,
}: {
  theme: Theme;
  value: Ref;
  onChange: (ref: Ref) => void;
  label: string;
  id?: string;
  none?: { value: "transparent" | "none"; label: string };
}) {
  return (
    <select id={id} className="select select-sm w-full" aria-label={label} value={value} onChange={(e) => onChange(e.target.value as Ref)}>
      {none && <option value={none.value}>{none.label}</option>}
      <optgroup label="Match the section">
        {ROLES.map((role) => (
          <option key={role} value={`scheme.${role}`}>
            Section {ROLE_LABELS[role].toLowerCase()}
          </option>
        ))}
      </optgroup>
      <optgroup label="Always this color">
        {theme.colors.map((c) => (
          <option key={c.id} value={`color.${c.id}`}>
            {c.name}
          </option>
        ))}
      </optgroup>
    </select>
  );
}

export function LockOrDelete({ builtin, label, onDelete }: { builtin?: boolean | undefined; label: string; onDelete: () => void }) {
  if (builtin) {
    return (
      <span className="tooltip tooltip-left" data-tip="Built-in. Components rely on it.">
        <span className="btn btn-ghost btn-sm btn-square pointer-events-none text-base-content/40">
          <Lock className="w-4 h-4" aria-hidden="true" />
          <span className="sr-only">{label} is built in</span>
        </span>
      </span>
    );
  }
  return (
    <button type="button" className="btn btn-ghost btn-sm btn-square" aria-label={`Delete ${label}`} onClick={onDelete}>
      <Trash2 className="w-4 h-4" aria-hidden="true" />
    </button>
  );
}

// "Add …" that asks for the name first: the new item's id is made from it and can't change later,
// so it should start out meaningful rather than as "new-color-3".
export function AddByName({ label, placeholder, onAdd }: { label: string; placeholder: string; onAdd: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  if (!open) {
    return (
      <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
        <Plus className="w-4 h-4" aria-hidden="true" />
        {label}
      </button>
    );
  }
  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setName("");
    setOpen(false);
  };
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <input
        // biome-ignore lint/a11y/noAutofocus: opened by the author's own click, to type straight away
        autoFocus
        className="input input-sm w-44"
        placeholder={placeholder}
        aria-label={`${label}: name`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      />
      <button type="submit" className="btn btn-sm btn-primary" disabled={!name.trim()}>
        Add
      </button>
      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  );
}

// A size in component units (1 unit = 0.25rem), labelled the way Space and Flex label theirs.
export function UnitsInput({
  value,
  onChange,
  label,
  min = 0,
  max = 40,
  step = 0.25,
  className = "w-28",
}: {
  value: number;
  onChange: (value: number) => void;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}) {
  return (
    <label className={`input input-sm ${className}`} title={units(value)}>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        aria-label={label}
        value={value}
        onChange={(e) => {
          const n = Number.parseFloat(e.target.value);
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
        }}
      />
      <span className="text-base-content/50 text-xs">units</span>
    </label>
  );
}

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
