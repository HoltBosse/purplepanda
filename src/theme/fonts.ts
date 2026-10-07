import { buildFontLink, extractFamilyFromLink } from "../form/fields/font-utils.js";
import type { Theme, ThemeFont, ThemeFontRole } from "./types.js";

// Which weights of each font the theme actually uses, so the stored Bunny link loads exactly those
// (limited to what the family offers) rather than a fixed 400 and 700.

const BUNNY_HOST = "fonts.bunny.net";

export function isBunnyLink(link: string): boolean {
  try {
    return new URL(link).hostname === BUNNY_HOST;
  } catch {
    return false;
  }
}

// The fonts a page has to load: Heading and Body (they style headings and the page itself), and any
// other font only while a text style uses it.
export function fontsInUse(theme: Theme): ThemeFontRole[] {
  const used = new Set(["heading", "body", ...theme.textStyles.map((t) => t.font)]);
  return theme.fonts.filter((f) => used.has(f.id));
}

export function weightsUsed(theme: Theme, role: string): number[] {
  const used = new Set(theme.textStyles.filter((t) => t.font === role).map((t) => t.weight));
  if (role === "body") {
    // Running text needs regular and bold, and buttons inherit the body font.
    used.add(400);
    used.add(700);
    used.add(theme.buttons.weight);
  }
  return [...used].sort((a, b) => a - b);
}

// The weights of `font` that `wanted` can be served in: each wanted weight if the family has it,
// else the nearest one it does have.
export function availableWeights(font: ThemeFont, wanted: number[]): number[] {
  if (font.weights.length === 0) return wanted;
  const nearest = (w: number) => font.weights.reduce((best, x) => (Math.abs(x - w) < Math.abs(best - w) ? x : best));
  return [...new Set(wanted.map(nearest))].sort((a, b) => a - b);
}

// Rebuilds each Bunny font link for the weights the theme uses. Links from elsewhere (the
// install's own preset stylesheets) are left alone: their weights aren't ours to choose.
export function withRebuiltFontLinks(theme: Theme): Theme {
  const fonts = theme.fonts.map((font) => {
    if (!font.family || !isBunnyLink(font.link)) return font;
    const weights = weightsUsed(theme, font.id);
    // A font no text style uses yet keeps its link; it isn't loaded on pages anyway.
    if (weights.length === 0) return font;
    return { ...font, link: buildFontLink(font.family, availableWeights(font, weights)) };
  });
  return { ...theme, fonts };
}

// The weights a font link asks for, e.g. `Inter:wght@400;700` → [400, 700].
function weightsFromLink(link: string): number[] {
  try {
    const family = new URL(link).searchParams.get("family") ?? "";
    const spec = family.split(":wght@")[1] ?? "";
    return spec
      .split(";")
      .map((w) => Number.parseInt(w, 10))
      .filter((w) => Number.isFinite(w));
  } catch {
    return [];
  }
}

// A theme font built from one of the old `heading_font_link` / `body_font_link` settings. The
// category isn't in the link; it stays empty (a sans-serif fallback) until the theme screen, which
// loads Bunny's font list, fills it in.
export function fontFromLegacyLink(link: unknown): ThemeFont | undefined {
  if (typeof link !== "string" || !link) return undefined;
  const family = extractFamilyFromLink(link);
  if (!family) return undefined;
  return { family, link, category: "", weights: weightsFromLink(link) };
}
