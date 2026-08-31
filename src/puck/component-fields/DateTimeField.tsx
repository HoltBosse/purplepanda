import type { CustomField } from "@puckeditor/core";
import { CalendarClock, CircleX } from "../icons.js";

// The native datetime-local input works in timezone-naive "wall clock" values
// (`YYYY-MM-DDTHH:mm`), which both the input element and `new Date(...)` treat as the browser's
// local time (per the ES2015 Date Time String Format: a date+time with no zone offset parses as
// local, not UTC). We only ever store/submit the UTC equivalent, so a stored value is converted
// to local wall-clock time to show in the input, and the input's local value is converted back to
// a UTC ISO string before it reaches onChange.

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function utcIsoToLocalInputValue(utcIso: string | undefined): string {
  if (!utcIso) return "";
  const date = new Date(utcIso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localInputValueToUtcIso(localValue: string): string {
  if (!localValue) return "";
  const date = new Date(localValue);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

function DateTimeFieldInner({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string | undefined;
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <div className="w-full">
      {/* Puck doesn't auto-render a label for "custom" fields (unlike its built-in field
          types), so this field renders its own — see field.label passed in below. */}
      {label && (
        <label className="mb-1 flex items-center gap-1 text-sm font-medium" htmlFor={id}>
          <CalendarClock size={16} />
          {label}
        </label>
      )}
      <div className="relative w-full">
        <input
          type="datetime-local"
          id={id}
          // pr-8 reserves room so typed digits never run under the clear button; the
          // ::-webkit-clear-button reset hides Chrome's own built-in clear "x" (it renders just
          // left of the calendar glyph) so it doesn't sit duplicated behind ours.
          className="input input-bordered w-full pr-8 [&::-webkit-clear-button]:hidden"
          value={utcIsoToLocalInputValue(value)}
          onChange={(e) => onChange(localInputValueToUtcIso(e.currentTarget.value))}
        />
        {value && (
          <button
            type="button"
            aria-label="Clear date/time"
            // Inset past the input's own calendar-picker-indicator (WebKit/Blink draw it flush
            // against the right edge, ~20-24px wide) so the two controls don't overlap.
            className="btn btn-circle btn-ghost btn-xs absolute right-7 top-1/2 z-10 -translate-y-1/2"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onChange("")}
          >
            <CircleX size={16} className="text-base-content/50" />
          </button>
        )}
      </div>
    </div>
  );
}

// Value is always a UTC ISO 8601 timestamp string (e.g. "2024-01-01T12:00:00.000Z") or "" —
// never a timezone-specific local time — regardless of the editing browser's timezone.
export const dateTimeField: CustomField<string> = {
  type: "custom",
  label: "Date/Time",
  render: ({ field, id, value, onChange }) => (
    <DateTimeFieldInner id={id} label={field.label} value={value} onChange={onChange} />
  ),
};
