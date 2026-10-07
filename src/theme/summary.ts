import { fontStack, themeFontLinks, themeToCss } from "./css.js";
import { followReplaced, liveIdsByKind } from "./normalize.js";
import { colorHex, fontRole, type Mode, refHex, resolveScheme, schemeFill } from "./resolve.js";
import type { ReplaceableKind, Theme } from "./types.js";

// What the editors need to know about the site theme, injected into admin pages by
// components/ThemeScript.astro the same way as __PP_DISABLED_COMPONENTS: the CSS and font links
// for the canvas, and the scheme, variant, text-style and border choices (with swatches) for the
// `scheme`, `variant`, `textStyle` and `border` fields.

type Swatch = Record<Mode, { fill: string; fg: string; muted: string; btnBg: string; btnFg: string }>;

export type ThemeSummary = {
  css: string;
  fontLinks: string[];
  schemes: { id: string; name: string; swatch: Swatch }[];
  // Each variant's colors as they'd look in the default scheme.
  variants: { id: string; name: string; swatch: Record<Mode, { bg: string; fg: string; border: string }> }[];
  textStyles: { id: string; name: string; fontFamily: string; size: number; weight: number }[];
  // Each border preset's width (px) and its color as it'd look in the default scheme.
  borders: { id: string; name: string; width: number; swatch: Record<Mode, { color: string }> }[];
  // `<kind>:<deleted id>` → the id it now renders as (see Theme["replaced"]).
  replaced: Record<string, string>;
};

export function themeSummary(theme: Theme): ThemeSummary {
  const modes: Mode[] = ["light", "dark"];
  const base = resolveScheme(theme, "default");
  const live = liveIdsByKind(theme);
  const replaced: Record<string, string> = {};
  for (const key of Object.keys(theme.replaced)) {
    const [kind, id] = key.split(":") as [ReplaceableKind, string];
    const target = followReplaced(theme.replaced, kind, id, live[kind]);
    if (target) replaced[key] = target;
  }

  return {
    css: themeToCss(theme),
    fontLinks: themeFontLinks(theme),
    schemes: theme.schemes.map((s) => ({
      id: s.id,
      name: s.name,
      swatch: Object.fromEntries(
        modes.map((m) => [
          m,
          {
            fill: schemeFill(theme, s, m),
            fg: colorHex(theme, s.roles.fg, m),
            muted: colorHex(theme, s.roles.muted, m),
            btnBg: colorHex(theme, s.roles.btnBg, m),
            btnFg: colorHex(theme, s.roles.btnFg, m),
          },
        ]),
      ) as Swatch,
    })),
    variants: theme.buttons.variants.map((v) => ({
      id: v.id,
      name: v.name,
      swatch: Object.fromEntries(
        modes.map((m) => [
          m,
          {
            bg: refHex(theme, v.bg, base, m) ?? "transparent",
            fg: refHex(theme, v.fg, base, m) ?? "inherit",
            border: refHex(theme, v.border, base, m) ?? "transparent",
          },
        ]),
      ) as Record<Mode, { bg: string; fg: string; border: string }>,
    })),
    textStyles: theme.textStyles.map((t) => ({
      id: t.id,
      name: t.name,
      fontFamily: fontStack(fontRole(theme, t.font)),
      size: t.size,
      weight: t.weight,
    })),
    borders: theme.borders.map((b) => ({
      id: b.id,
      name: b.name,
      width: b.width,
      swatch: Object.fromEntries(modes.map((m) => [m, { color: refHex(theme, b.color, base, m) ?? "transparent" }])) as Record<Mode, { color: string }>,
    })),
    replaced,
  };
}

export const THEME_GLOBAL = "__PP_THEME";

type GlobalWithTheme = typeof globalThis & { __PP_THEME?: ThemeSummary };

// In the browser: the injected summary, or undefined outside the admin (and in tests).
export function getInjectedTheme(): ThemeSummary | undefined {
  return (globalThis as GlobalWithTheme).__PP_THEME;
}

export function setInjectedTheme(summary: ThemeSummary): void {
  (globalThis as GlobalWithTheme).__PP_THEME = summary;
}

// The theme screen announces a save on this channel so open editors restyle their canvas
// without a reload.
export const THEME_CHANNEL = "purplepanda-theme";
