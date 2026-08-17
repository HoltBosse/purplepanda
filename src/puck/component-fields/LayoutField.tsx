import type { CustomField } from "@puckeditor/core";
import { useState } from "react";
import * as z from "zod";
import { Monitor, Smartphone, Tablet } from "../icons.js";

export type GridLayout = { columns: number; gap: number };

// Desktop is the source of truth: editing it also pushes its values into tablet/mobile as long
// as that breakpoint hasn't been edited directly (tracked by the "*Customized" flags below).
// Once a breakpoint is edited directly, it decouples from desktop and holds its own value.
export type ResponsiveLayout = {
  desktop: GridLayout;
  tablet: GridLayout;
  mobile: GridLayout;
  tabletCustomized: boolean;
  mobileCustomized: boolean;
};

export const DEFAULT_LAYOUT: ResponsiveLayout = {
  desktop: { columns: 3, gap: 4 },
  tablet: { columns: 3, gap: 4 },
  mobile: { columns: 3, gap: 4 },
  tabletCustomized: false,
  mobileCustomized: false,
};

type Breakpoint = "desktop" | "tablet" | "mobile";

const BREAKPOINT_TABS: { key: Breakpoint; label: string; icon: typeof Monitor }[] = [
  { key: "desktop", label: "Desktop", icon: Monitor },
  { key: "tablet", label: "Tablet", icon: Tablet },
  { key: "mobile", label: "Mobile", icon: Smartphone },
];

// Custom field UI: desktop/tablet/mobile tabs (icons only), each showing a Columns + Gap pair
// for that breakpoint. Desktop opens by default. Editing desktop also live-updates whichever of
// tablet/mobile hasn't been customized yet; editing tablet or mobile directly marks it customized
// so it stops following desktop.
function ResponsiveLayoutField({ value, onChange }: { value: ResponsiveLayout | undefined; onChange: (value: ResponsiveLayout) => void }) {
  const [active, setActive] = useState<Breakpoint>("desktop");
  const resolvedValue = value ?? DEFAULT_LAYOUT;
  const current = resolvedValue[active];

  const updateBreakpoint = (grid: GridLayout) => {
    if (active === "desktop") {
      onChange({
        ...resolvedValue,
        desktop: grid,
        tablet: resolvedValue.tabletCustomized ? resolvedValue.tablet : grid,
        mobile: resolvedValue.mobileCustomized ? resolvedValue.mobile : grid,
      });
      return;
    }

    onChange({
      ...resolvedValue,
      [active]: grid,
      ...(active === "tablet" ? { tabletCustomized: true } : { mobileCustomized: true }),
    });
  };

  return (
    <div>
      <div className="tabs tabs-box tabs-sm mb-2" role="tablist">
        {BREAKPOINT_TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-label={label}
            title={label}
            className={`tab ${active === key ? "tab-active" : ""}`}
            onClick={() => setActive(key)}
          >
            <Icon className="size-4" />
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs text-base-content/60">Columns</span>
          <input
            type="number"
            className="input input-bordered input-sm w-full"
            min={1}
            max={12}
            value={current.columns}
            onChange={(e) => updateBreakpoint({ ...current, columns: Number(e.target.value) })}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs text-base-content/60">Gap</span>
          <input
            type="number"
            className="input input-bordered input-sm w-full"
            min={0}
            value={current.gap}
            onChange={(e) => updateBreakpoint({ ...current, gap: Number(e.target.value) })}
          />
        </label>
      </div>
    </div>
  );
}

export const layoutField: CustomField<ResponsiveLayout> = {
  type: "custom",
  label: "Layout",
  render: ({ value, onChange }) => <ResponsiveLayoutField value={value} onChange={onChange} />,
};

// Mirrors the columns (1-12) / gap (>= 0) bounds the sliders in ResponsiveLayoutField enforce in
// the UI — Puck's own field `min`/`max` are display hints only, not enforced server-side, so a
// direct POST could otherwise smuggle an out-of-range or negative value straight into the DB.
const gridLayoutSchema = z.object({
  columns: z.number().int().min(1).max(12),
  gap: z.number().min(0),
});

export const responsiveLayoutSchema = z.object({
  desktop: gridLayoutSchema,
  tablet: gridLayoutSchema,
  mobile: gridLayoutSchema,
  tabletCustomized: z.boolean(),
  mobileCustomized: z.boolean(),
});
