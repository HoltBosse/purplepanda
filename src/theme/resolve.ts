import { followReplaced, liveIds, REPLACEMENT_DEFAULTS } from "./normalize.js";
import {
  type ButtonVariant,
  parseRef,
  type Ref,
  type ReplaceableKind,
  type Role,
  type TextStyle,
  type Theme,
  type ThemeColor,
  type ThemeFontRole,
  type ThemeGradient,
  type ThemeScheme,
} from "./types.js";

// Lookups from the ids stored in page content to theme items. A deleted id follows the theme's
// `replaced` tombstones, and anything still unknown falls back to the built-in default — content
// never fails to render because of a theme edit.

export type Mode = "light" | "dark";

function resolveId(theme: Theme, kind: ReplaceableKind, id: string | undefined | null): string {
  return (id && followReplaced(theme.replaced, kind, id, liveIds(theme, kind))) || REPLACEMENT_DEFAULTS[kind];
}

export function resolveSchemeId(theme: Theme, id: string | undefined | null): string {
  return resolveId(theme, "scheme", id);
}

export function resolveScheme(theme: Theme, id: string | undefined | null): ThemeScheme {
  const resolved = resolveSchemeId(theme, id);
  return (theme.schemes.find((s) => s.id === resolved) ?? theme.schemes[0]) as ThemeScheme;
}

export function resolveVariantId(theme: Theme, id: string | undefined | null): string {
  return resolveId(theme, "variant", id);
}

export function resolveVariant(theme: Theme, id: string | undefined | null): ButtonVariant {
  const resolved = resolveVariantId(theme, id);
  return (theme.buttons.variants.find((v) => v.id === resolved) ?? theme.buttons.variants[0]) as ButtonVariant;
}

export function resolveTextStyleId(theme: Theme, id: string | undefined | null): string {
  return resolveId(theme, "textStyle", id);
}

export function resolveTextStyle(theme: Theme, id: string | undefined | null): TextStyle {
  const resolved = resolveTextStyleId(theme, id);
  return (theme.textStyles.find((t) => t.id === resolved) ?? theme.textStyles.find((t) => t.id === "body")) as TextStyle;
}

// A font role by id, or the body font for an id the theme doesn't have.
export function fontRole(theme: Theme, id: string): ThemeFontRole {
  return (theme.fonts.find((f) => f.id === id) ?? theme.fonts.find((f) => f.id === "body") ?? theme.fonts[0]) as ThemeFontRole;
}

export function findColor(theme: Theme, id: string): ThemeColor | undefined {
  return theme.colors.find((c) => c.id === id);
}

export function colorHex(theme: Theme, id: string, mode: Mode): string {
  return findColor(theme, id)?.[mode] ?? "#888888";
}

export function findGradient(theme: Theme, id: string | undefined): ThemeGradient | undefined {
  return id ? theme.gradients.find((g) => g.id === id) : undefined;
}

// A variant or border color as a hex value inside `scheme`, or undefined for transparent/none.
export function refHex(theme: Theme, ref: Ref, scheme: ThemeScheme, mode: Mode): string | undefined {
  const target = parseRef(ref);
  if (!target) return undefined;
  return colorHex(theme, "role" in target ? scheme.roles[target.role as Role] : target.color, mode);
}

export function gradientCss(gradient: ThemeGradient, color: (id: string) => string): string {
  const stops = gradient.stops.map((s) => `${color(s.color)} ${s.at}%`).join(", ");
  return gradient.type === "radial" ? `radial-gradient(circle at 30% 20%, ${stops})` : `linear-gradient(${gradient.angle}deg, ${stops})`;
}

// What a scheme paints as its background: its gradient, or its solid color.
export function schemeFill(theme: Theme, scheme: ThemeScheme, mode: Mode): string {
  const gradient = findGradient(theme, scheme.gradient);
  return gradient ? gradientCss(gradient, (id) => colorHex(theme, id, mode)) : colorHex(theme, scheme.roles.bg, mode);
}

// Where each id is referenced inside the theme itself (schemes, variants, borders, gradients), for
// the colors table's "used by" count and for rewriting references when a color is deleted.
export function colorUsage(theme: Theme, id: string): number {
  let n = 0;
  for (const s of theme.schemes) for (const role of Object.values(s.roles)) if (role === id) n++;
  for (const v of theme.buttons.variants) for (const ref of [v.bg, v.fg, v.border]) if (ref === `color.${id}`) n++;
  for (const b of theme.borders) if (b.color === `color.${id}`) n++;
  for (const g of theme.gradients) for (const s of g.stops) if (s.color === id) n++;
  return n;
}

// Deleting a color is internal to the theme, so its references are rewritten in place rather
// than tombstoned. Returns a new theme.
export function deleteColor(theme: Theme, id: string, replacement: string): Theme {
  const next = structuredClone(theme);
  const swap = (ref: Ref): Ref => (ref === `color.${id}` ? `color.${replacement}` : ref);
  for (const s of next.schemes) for (const role of Object.keys(s.roles) as Role[]) if (s.roles[role] === id) s.roles[role] = replacement;
  for (const v of next.buttons.variants) {
    v.bg = swap(v.bg);
    v.fg = swap(v.fg);
    v.border = swap(v.border);
  }
  for (const b of next.borders) b.color = swap(b.color);
  for (const g of next.gradients) for (const s of g.stops) if (s.color === id) s.color = replacement;
  next.colors = next.colors.filter((c) => c.id !== id);
  return next;
}

// Deleting a scheme, variant, text style or border preset leaves a tombstone instead of rewriting content: pages,
// templates, drafts and old revisions keep the old id and resolve it to `replacement`. Returns a new
// theme.
export function deleteWithReplacement(theme: Theme, kind: ReplaceableKind, id: string, replacement: string): Theme {
  const next = structuredClone(theme);
  if (kind === "scheme") next.schemes = next.schemes.filter((s) => s.id !== id || s.builtin);
  else if (kind === "variant") next.buttons.variants = next.buttons.variants.filter((v) => v.id !== id || v.builtin);
  else if (kind === "border") {
    next.borders = next.borders.filter((b) => b.id !== id || b.builtin);
    // The card setting lives in the theme, so it's rewritten rather than tombstoned.
    if (next.card.border === id) next.card.border = replacement;
  } else next.textStyles = next.textStyles.filter((t) => t.id !== id || t.builtin);
  next.replaced[`${kind}:${id}`] = replacement;
  // Anything that was already pointing at the deleted item now points straight at its replacement.
  for (const [key, target] of Object.entries(next.replaced)) {
    if (key.startsWith(`${kind}:`) && target === id) next.replaced[key] = replacement;
  }
  return next;
}

// Fonts are only referenced inside the theme (by text styles), so deleting one rewrites those text
// styles in place, the way deleting a color does. Built-in fonts can't be deleted. Returns a new
// theme.
export function deleteFont(theme: Theme, id: string, replacement: string): Theme {
  const next = structuredClone(theme);
  if (next.fonts.find((f) => f.id === id)?.builtin) return next;
  for (const t of next.textStyles) if (t.font === id) t.font = replacement;
  next.fonts = next.fonts.filter((f) => f.id !== id);
  return next;
}

export function fontUsage(theme: Theme, id: string): number {
  return theme.textStyles.filter((t) => t.font === id).length;
}

export function deleteGradient(theme: Theme, id: string): Theme {
  const next = structuredClone(theme);
  for (const s of next.schemes) if (s.gradient === id) delete s.gradient;
  next.gradients = next.gradients.filter((g) => g.id !== id);
  return next;
}
