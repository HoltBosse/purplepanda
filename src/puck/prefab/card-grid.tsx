// Responsive grid geometry for CardCollection. Split out of CardCollection.tsx so it can be
// imported without that file's `virtual:purplepanda/puck-config` dependency, which only resolves
// inside an Astro build.
import type { CSSProperties } from "react";

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
export function buildGridLayout(id: string, layout: ResponsiveLayout | undefined) {
  const resolvedLayout = layout ?? DEFAULT_LAYOUT;
  const className = `CardCollection-${id}`;

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
