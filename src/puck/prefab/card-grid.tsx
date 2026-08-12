// Responsive grid geometry, shared by CardCollection and Grid. Split out of CardCollection.tsx so
// it can be imported without that file's `virtual:purplepanda/puck-config` dependency, which only
// resolves inside an Astro build.
import type { CustomField } from "@puckeditor/core";
import type { CSSProperties } from "react";
import { useState } from "react";
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

export const TABLET_BREAKPOINT = 769;
export const MOBILE_BREAKPOINT = 361;

export const DEFAULT_LAYOUT: ResponsiveLayout = {
  desktop: { columns: 3, gap: 4 },
  tablet: { columns: 3, gap: 4 },
  mobile: { columns: 3, gap: 4 },
  tabletCustomized: false,
  mobileCustomized: false,
};

// Builds the scoped class + CSS custom properties that drive the responsive grid, shared by
// both the editing view and the published render so their layout stays identical.
export function buildGridLayout(id: string, layout: ResponsiveLayout | undefined, classPrefix = "CardCollection") {
  const resolvedLayout = layout ?? DEFAULT_LAYOUT;
  const className = `${classPrefix}-${id}`;

  const styleTag = (
    <style>{`
      .${className} {
        display: grid;
        grid-template-columns: repeat(var(--columns-desktop), 1fr);
        gap: var(--gap-desktop);
      }
      @media (max-width: ${TABLET_BREAKPOINT}px) {
        .${className} {
          grid-template-columns: repeat(var(--columns-tablet), 1fr);
          gap: var(--gap-tablet);
        }
      }
      @media (max-width: ${MOBILE_BREAKPOINT}px) {
        .${className} {
          grid-template-columns: repeat(var(--columns-mobile), 1fr);
          gap: var(--gap-mobile);
        }
      }
    `}</style>
  );

  const style = {
    "--columns-desktop": resolvedLayout.desktop.columns,
    "--gap-desktop": `${resolvedLayout.desktop.gap * 0.25}rem`,
    "--columns-tablet": resolvedLayout.tablet.columns,
    "--gap-tablet": `${resolvedLayout.tablet.gap * 0.25}rem`,
    "--columns-mobile": resolvedLayout.mobile.columns,
    "--gap-mobile": `${resolvedLayout.mobile.gap * 0.25}rem`,
  } as CSSProperties;

  return { className, styleTag, style };
}

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
