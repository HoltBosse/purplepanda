// Responsive grid geometry, shared by CardCollection and Grid. Split out of CardCollection.tsx so
// it can be imported without that file's `virtual:purplepanda/puck-config` dependency, which only
// resolves inside an Astro build.
import type { CSSProperties } from "react";
import { DEFAULT_LAYOUT, type ResponsiveLayout } from "../component-fields/LayoutField.js";

export type { GridLayout, ResponsiveLayout } from "../component-fields/LayoutField.js";

export const TABLET_BREAKPOINT = 769;
export const MOBILE_BREAKPOINT = 361;

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
