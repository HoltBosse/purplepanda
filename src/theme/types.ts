// The site theme: named colors (each with a light and a dark value), schemes built from them,
// gradients, fonts, text styles, radii, button variants, border presets and the card look. One per
// site, stored whole as the `theme` settings row (see ./server.ts). Page content only ever stores
// the ids defined here (`{ scheme: "brand" }`, `{ variant: "accent" }`, `{ textStyle: "h2" }`), so
// editing the theme restyles every page. Sizes are in component units (see ./units.ts) unless a
// field says otherwise.

export const ROLES = ["bg", "fg", "muted", "btnBg", "btnFg", "border"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  bg: "Background",
  fg: "Text",
  muted: "Muted text",
  btnBg: "Button background",
  btnFg: "Button text",
  border: "Border",
};

// A color a button variant or border preset points at: one of the surrounding scheme's roles
// ("match the section"), a fixed theme color, or nothing.
export type Ref = "transparent" | "none" | `scheme.${Role}` | `color.${string}`;

// What a ref points at: a scheme role or a color id. Undefined for "transparent", "none" (or
// anything else).
export function parseRef(ref: string): { role: string } | { color: string } | undefined {
  if (ref.startsWith("scheme.")) return { role: ref.slice(7) };
  if (ref.startsWith("color.")) return { color: ref.slice(6) };
  return undefined;
}

// A color value as the theme stores it: #rrggbb.
export const HEX_PATTERN = /^#[0-9a-f]{6}$/i;

export type ThemeColor = { id: string; name: string; light: string; dark: string };

export type GradientStop = { color: string; at: number };
export type ThemeGradient = {
  id: string;
  name: string;
  type: "linear" | "radial";
  angle: number;
  stops: GradientStop[];
};

export type ThemeScheme = {
  id: string;
  name: string;
  builtin?: true;
  // When set, the element carrying the scheme paints this gradient; roles.bg stays the solid
  // color nested surfaces use.
  gradient?: string;
  roles: Record<Role, string>;
};

export type ThemeFont = {
  // Empty means no font is set, and text uses the browser's default stack.
  family: string;
  link: string;
  // Bunny's category ("sans-serif", "serif", "display", "handwriting", "monospace"), for the
  // fallback stack. Empty when unknown.
  category: string;
  // The weights the family offers. Text-style and button weight pickers only offer these.
  weights: number[];
};

// A named font the theme offers. Heading and Body are built in: Heading also styles every h1–h6
// and Body the page itself. Others (an accent script, a mono) are only reached through text styles,
// and only load on pages when a text style uses them.
export type ThemeFontRole = ThemeFont & { id: string; name: string; builtin?: true };

// A font slot with nothing chosen.
export const NO_FONT: ThemeFont = { family: "", link: "", category: "", weights: [] };

export const BUILTIN_FONT_IDS = ["heading", "body"] as const;

// Built-in text styles, in order. Editors can add their own, which can be deleted like variants.
export const BUILTIN_TEXT_STYLE_IDS = ["display", "h1", "h2", "h3", "body", "small"] as const;

export type TextStyle = {
  id: string;
  name: string;
  builtin?: true;
  font: string; // a font role id
  size: number; // units
  weight: number;
  lineHeight: number; // ratio
};

export type RadiusKey = "sm" | "md" | "lg" | "full";
export type Radii = { sm: number; md: number; lg: number; full: "full" };

export type ButtonSize = "compact" | "default" | "large";

export type ButtonVariant = { id: string; name: string; builtin?: true; bg: Ref; fg: Ref; border: Ref };

export type BorderPreset = { id: string; name: string; builtin?: true; width: number /* px */; color: Ref };

// Which edges of a surface carry its border. Stored in content (and theme.card) as a list, in this
// order, so any combination works: one side, top and bottom, left and right, all four.
export const BORDER_SIDES = ["top", "right", "bottom", "left"] as const;
export type BorderSide = (typeof BORDER_SIDES)[number];

// Not a preset: what components store for "no border". Never handed out as a preset id.
export const NO_BORDER = "none";

export type CardShadow = "none" | "soft" | "raised";
export type CardPadding = "compact" | "comfortable" | "roomy";

export type Theme = {
  version: 1;
  colors: ThemeColor[];
  gradients: ThemeGradient[];
  schemes: ThemeScheme[];
  fonts: ThemeFontRole[];
  textStyles: TextStyle[];
  radii: Radii;
  buttons: {
    radius: RadiusKey;
    weight: number;
    size: ButtonSize;
    variants: ButtonVariant[];
  };
  borders: BorderPreset[];
  card: {
    border: string; // a border preset id, or "none"
    sides: BorderSide[];
    radius: Exclude<RadiusKey, "full">;
    shadow: CardShadow;
    padding: CardPadding;
  };
  // Tombstones for deleted schemes, variants, text styles and border presets: `scheme:<old id>`,
  // `variant:<old id>`, `textStyle:<old id>` or `border:<old id>` → the id that replaced it.
  // Content keeps the old id; resolution (and the generated CSS) follows this.
  replaced: Record<string, string>;
};

export type ReplaceableKind = "scheme" | "variant" | "textStyle" | "border";
export const REPLACEABLE_KINDS: readonly ReplaceableKind[] = ["scheme", "variant", "textStyle", "border"];

export const BUILTIN_SCHEME_IDS = ["default"] as const;
export const BUILTIN_VARIANT_IDS = ["primary", "secondary", "ghost"] as const;
export const BUILTIN_BORDER_IDS = ["subtle", "strong"] as const;

export const FONT_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

// Fixed presets, in code rather than the theme: the theme only chooses which one applies.
export const BUTTON_SIZES: Record<ButtonSize, { label: string; minHeight: number; paddingX: number; fontSize: number }> = {
  compact: { label: "Compact", minHeight: 8, paddingX: 3, fontSize: 3 },
  default: { label: "Default", minHeight: 10, paddingX: 4, fontSize: 3.5 },
  large: { label: "Large", minHeight: 12, paddingX: 5, fontSize: 4.5 },
};

export const CARD_PADDINGS: Record<CardPadding, { label: string; padding: number }> = {
  compact: { label: "Compact", padding: 3 },
  comfortable: { label: "Comfortable", padding: 5 },
  roomy: { label: "Roomy", padding: 7 },
};

export const CARD_SHADOWS: Record<CardShadow, { label: string; css: string }> = {
  none: { label: "None", css: "none" },
  soft: { label: "Soft", css: "0 1px 3px rgba(0,0,0,.08), 0 4px 12px rgba(0,0,0,.06)" },
  raised: { label: "Raised", css: "0 12px 32px rgba(0,0,0,.16)" },
};
