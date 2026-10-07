import { colorHex, findGradient, type Mode, refHex } from "./resolve.js";
import type { Theme, ThemeScheme } from "./types.js";

// WCAG 2 contrast: text needs 4.5:1.
export const TEXT_CONTRAST = 4.5;

export function relativeLuminance(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = Number.parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const x = relativeLuminance(a);
  const y = relativeLuminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export type ContrastIssue = { label: string; ratio: number; required: number };

// Every background a scheme's content can sit on: each gradient stop, or the solid color.
function backgrounds(theme: Theme, scheme: ThemeScheme, mode: Mode): string[] {
  const gradient = findGradient(theme, scheme.gradient);
  return gradient ? gradient.stops.map((s) => colorHex(theme, s.color, mode)) : [colorHex(theme, scheme.roles.bg, mode)];
}

function worst(fg: string, bgs: string[]): number {
  return Math.min(...bgs.map((bg) => contrastRatio(fg, bg)));
}

// Everything readable in `scheme` that falls short: body and muted text against the background
// (every stop of a gradient), and each button variant's text against its own background — or the
// section's, for a transparent (outline or ghost) variant.
export function schemeContrastIssues(theme: Theme, scheme: ThemeScheme, mode: Mode): ContrastIssue[] {
  const bgs = backgrounds(theme, scheme, mode);
  const gradient = Boolean(findGradient(theme, scheme.gradient));
  const issues: ContrastIssue[] = [];
  const check = (label: string, ratio: number, required: number) => {
    if (ratio < required) issues.push({ label, ratio, required });
  };

  check(gradient ? "text at a gradient stop" : "text", worst(colorHex(theme, scheme.roles.fg, mode), bgs), TEXT_CONTRAST);
  check(gradient ? "muted text at a gradient stop" : "muted text", worst(colorHex(theme, scheme.roles.muted, mode), bgs), TEXT_CONTRAST);

  for (const variant of theme.buttons.variants) {
    const fg = refHex(theme, variant.fg, scheme, mode);
    const bg = refHex(theme, variant.bg, scheme, mode);
    if (!fg) continue;
    const label = variant.name.toLowerCase();
    check(`${label} button`, bg ? contrastRatio(fg, bg) : worst(fg, bgs), TEXT_CONTRAST);
  }
  return issues;
}
