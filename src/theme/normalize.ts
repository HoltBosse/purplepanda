import { ID_PATTERN } from "./ids.js";
import { DEFAULT_THEME } from "./presets.js";
import {
  BORDER_SIDES,
  type BorderPreset,
  type BorderSide,
  BUILTIN_BORDER_IDS,
  BUILTIN_FONT_IDS,
  BUILTIN_SCHEME_IDS,
  BUILTIN_TEXT_STYLE_IDS,
  BUILTIN_VARIANT_IDS,
  BUTTON_SIZES,
  type ButtonVariant,
  CARD_PADDINGS,
  CARD_SHADOWS,
  FONT_WEIGHTS,
  type GradientStop,
  HEX_PATTERN,
  NO_BORDER,
  NO_FONT,
  parseRef,
  type Radii,
  REPLACEABLE_KINDS,
  type Ref,
  type ReplaceableKind,
  ROLES,
  type Role,
  type TextStyle,
  type Theme,
  type ThemeColor,
  type ThemeFont,
  type ThemeFontRole,
  type ThemeGradient,
  type ThemeScheme,
} from "./types.js";

// Reads any stored value (including nothing, or a theme saved by an older build) as a valid Theme,
// the same way normalizeComponentSettings reads component settings: missing fields come from
// `fallback`, unknown ones are dropped, and references that no longer resolve are repaired. Run on
// every read, so the stored shape can change without a migration.

type Obj = Record<string, unknown>;

const MAX_NAME = 60;

function isObj(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function name(value: unknown, fallback: string): string {
  const text = typeof value === "string" ? value.trim().slice(0, MAX_NAME) : "";
  return text || fallback;
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return typeof value === "string" && (options as readonly string[]).includes(value) ? (value as T) : fallback;
}

function weight(value: unknown, fallback: number): number {
  return typeof value === "number" && (FONT_WEIGHTS as readonly number[]).includes(value) ? value : fallback;
}

function hex(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX_PATTERN.test(value) ? value.toLowerCase() : fallback;
}

// Each item with a valid, not-yet-seen id, in order.
function withUniqueIds(items: unknown[]): Obj[] {
  const seen = new Set<string>();
  return items.filter((item): item is Obj => {
    if (!isObj(item) || typeof item.id !== "string" || !ID_PATTERN.test(item.id) || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

// Puts any missing built-in back where it belongs: at its index in `builtinIds`.
function withBuiltins<T extends { id: string }>(items: T[], builtinIds: readonly string[], make: (id: string) => T): T[] {
  const out = [...items];
  builtinIds.forEach((id, index) => {
    if (!out.some((item) => item.id === id)) out.splice(Math.min(index, out.length), 0, make(id));
  });
  return out;
}

function normalizeColors(stored: unknown, fallback: ThemeColor[]): ThemeColor[] {
  const colors = withUniqueIds(arr(stored)).map((c) => {
    const light = hex(c.light, "#888888");
    return { id: c.id as string, name: name(c.name, c.id as string), light, dark: hex(c.dark, light) };
  });
  return colors.length > 0 ? colors : structuredClone(fallback);
}

function normalizeGradients(stored: unknown, colorIds: Set<string>): ThemeGradient[] {
  return withUniqueIds(arr(stored)).flatMap((g) => {
    const stops: GradientStop[] = arr(g.stops)
      .filter((s): s is Obj => isObj(s) && typeof s.color === "string" && colorIds.has(s.color))
      .slice(0, 4)
      .map((s) => ({ color: s.color as string, at: Math.round(num(s.at, 0, 0, 100)) }));
    if (stops.length < 2) return [];
    return [
      {
        id: g.id as string,
        name: name(g.name, g.id as string),
        type: oneOf(g.type, ["linear", "radial"] as const, "linear"),
        angle: Math.round(num(g.angle, 90, 0, 360)),
        stops,
      },
    ];
  });
}

// A color id that exists: `preferred` if it does, else the fallback theme's choice for the same
// slot, else the first color.
function pickColor(preferred: unknown, fallbackId: string | undefined, colorIds: Set<string>, first: string): string {
  if (typeof preferred === "string" && colorIds.has(preferred)) return preferred;
  if (fallbackId && colorIds.has(fallbackId)) return fallbackId;
  return first;
}

function normalizeSchemes(stored: unknown, fallback: Theme, colorIds: Set<string>, gradientIds: Set<string>, first: string): ThemeScheme[] {
  const fallbackDefault = fallback.schemes.find((s) => s.id === "default") ?? fallback.schemes[0];
  const toScheme = (s: Obj): ThemeScheme => {
    const storedRoles = isObj(s.roles) ? s.roles : {};
    const roles = Object.fromEntries(
      ROLES.map((role) => [role, pickColor(storedRoles[role], fallbackDefault?.roles[role], colorIds, first)]),
    ) as Record<Role, string>;
    const scheme: ThemeScheme = { id: s.id as string, name: name(s.name, s.id as string), roles };
    if ((BUILTIN_SCHEME_IDS as readonly string[]).includes(scheme.id)) scheme.builtin = true;
    if (typeof s.gradient === "string" && gradientIds.has(s.gradient)) scheme.gradient = s.gradient;
    return scheme;
  };
  return withBuiltins(withUniqueIds(arr(stored)).map(toScheme), BUILTIN_SCHEME_IDS, (id) => {
    const from = fallback.schemes.find((s) => s.id === id) ?? fallbackDefault;
    return toScheme({ ...(from as unknown as Obj), id });
  });
}

function normalizeRef(value: unknown, colorIds: Set<string>, allowed: { transparent?: boolean; none?: boolean }, fallback: Ref): Ref {
  if (typeof value !== "string") return fallback;
  if (value === "transparent") return allowed.transparent ? value : fallback;
  if (value === "none") return allowed.none ? value : fallback;
  const target = parseRef(value);
  if (!target) return fallback;
  const valid = "role" in target ? (ROLES as readonly string[]).includes(target.role) : colorIds.has(target.color);
  return valid ? (value as Ref) : fallback;
}

function normalizeVariants(stored: unknown, fallback: Theme, colorIds: Set<string>): ButtonVariant[] {
  const toVariant = (v: Obj): ButtonVariant => {
    const variant: ButtonVariant = {
      id: v.id as string,
      name: name(v.name, v.id as string),
      bg: normalizeRef(v.bg, colorIds, { transparent: true }, "scheme.btnBg"),
      fg: normalizeRef(v.fg, colorIds, {}, "scheme.btnFg"),
      border: normalizeRef(v.border, colorIds, { none: true }, "none"),
    };
    if ((BUILTIN_VARIANT_IDS as readonly string[]).includes(variant.id)) variant.builtin = true;
    return variant;
  };
  return withBuiltins(withUniqueIds(arr(stored)).map(toVariant), BUILTIN_VARIANT_IDS, (id) => {
    const from = fallback.buttons.variants.find((v) => v.id === id) ?? DEFAULT_THEME.buttons.variants.find((v) => v.id === id);
    return toVariant({ ...(from as unknown as Obj), id });
  });
}

// A list of sides in BORDER_SIDES order without repeats, or `fallback` for anything that isn't a
// list. An empty list is kept: it means no side has a border.
export function normalizeSides(value: unknown, fallback: readonly BorderSide[]): BorderSide[] {
  if (!Array.isArray(value)) return [...fallback];
  return BORDER_SIDES.filter((side) => value.includes(side));
}

function normalizeBorders(stored: unknown, fallback: Theme, colorIds: Set<string>): BorderPreset[] {
  const toBorder = (b: Obj): BorderPreset => {
    const border: BorderPreset = {
      id: b.id as string,
      name: name(b.name, b.id as string),
      width: Math.round(num(b.width, 1, 1, 8)),
      color: normalizeRef(b.color, colorIds, {}, "scheme.border"),
    };
    if ((BUILTIN_BORDER_IDS as readonly string[]).includes(border.id)) border.builtin = true;
    return border;
  };
  // "none" is what components store for no border, so it can't name a preset.
  const borders = withUniqueIds(arr(stored))
    .filter((b) => b.id !== NO_BORDER)
    .map(toBorder);
  return withBuiltins(borders, BUILTIN_BORDER_IDS, (id) => {
    const from = fallback.borders.find((b) => b.id === id) ?? DEFAULT_THEME.borders.find((b) => b.id === id);
    return toBorder({ ...(from as unknown as Obj), id });
  });
}

// Only https stylesheets: the link ends up in a <link href> on every page.
function fontLink(value: unknown): string {
  if (typeof value !== "string" || !value) return "";
  try {
    return new URL(value).protocol === "https:" ? value : "";
  } catch {
    return "";
  }
}

function normalizeFont(stored: unknown, fallback: ThemeFont): ThemeFont {
  if (!isObj(stored)) return structuredClone(fallback);
  // Quotes and the like would break out of the font-family declaration it's written into.
  const family = str(stored.family, "").replace(/[^\p{L}\p{N} _-]/gu, "").trim().slice(0, 80);
  const link = family ? fontLink(stored.link) : "";
  return {
    family,
    link,
    category: family ? str(stored.category, "").replace(/[^a-z-]/g, "").slice(0, 30) : "",
    weights: family
      ? [...new Set(arr(stored.weights).filter((w): w is number => (FONT_WEIGHTS as readonly unknown[]).includes(w)))].sort((a, b) => a - b)
      : [],
  };
}

// More than a handful of families slows every page down; this is only a backstop against abuse, the
// theme screen warns well before it.
export const MAX_FONTS = 8;
export const MAX_TEXT_STYLES = 30;

function normalizeFonts(stored: unknown, fallback: ThemeFontRole[]): ThemeFontRole[] {
  // Themes saved before fonts became a list stored `{ heading: {...}, body: {...} }`.
  const list: unknown[] = Array.isArray(stored)
    ? stored
    : isObj(stored)
      ? Object.entries(stored).map(([id, font]) => (isObj(font) ? { ...font, id, name: id === "heading" ? "Heading" : id === "body" ? "Body" : id } : font))
      : fallback;
  const toRole = (f: Obj): ThemeFontRole => {
    const role: ThemeFontRole = { id: f.id as string, name: name(f.name, f.id as string), ...normalizeFont(f, NO_FONT) };
    if ((BUILTIN_FONT_IDS as readonly string[]).includes(role.id)) role.builtin = true;
    return role;
  };
  const roles = withUniqueIds(list).map(toRole).slice(0, MAX_FONTS);
  return withBuiltins(roles, BUILTIN_FONT_IDS, (id) => {
    const from = fallback.find((f) => f.id === id) ?? DEFAULT_THEME.fonts.find((f) => f.id === id);
    return toRole({ ...(from as unknown as Obj), id });
  });
}

function normalizeTextStyles(stored: unknown, fallback: TextStyle[], fontIds: Set<string>): TextStyle[] {
  const toStyle = (t: Obj): TextStyle => {
    const id = t.id as string;
    const base = fallback.find((x) => x.id === id) ??
      DEFAULT_THEME.textStyles.find((x) => x.id === id) ?? { name: id, font: "body", size: 4, weight: 400, lineHeight: 1.5 };
    const style: TextStyle = {
      id,
      name: name(t.name, base.name),
      font: typeof t.font === "string" && fontIds.has(t.font) ? t.font : fontIds.has(base.font) ? base.font : "body",
      size: Math.round(num(t.size, base.size, 1, 40) * 4) / 4,
      weight: weight(t.weight, base.weight),
      lineHeight: Math.round(num(t.lineHeight, base.lineHeight, 0.8, 3) * 100) / 100,
    };
    if ((BUILTIN_TEXT_STYLE_IDS as readonly string[]).includes(id)) style.builtin = true;
    return style;
  };
  const styles = withUniqueIds(Array.isArray(stored) ? stored : fallback).map(toStyle).slice(0, MAX_TEXT_STYLES);
  return withBuiltins(styles, BUILTIN_TEXT_STYLE_IDS, (id) => toStyle({ id }));
}

function normalizeRadii(stored: unknown, fallback: Radii): Radii {
  const r = isObj(stored) ? stored : {};
  const step = (value: unknown, base: number) => Math.round(num(value, base, 0, 40) * 4) / 4;
  return { sm: step(r.sm, fallback.sm), md: step(r.md, fallback.md), lg: step(r.lg, fallback.lg), full: "full" };
}

// Follows `replaced` from `id` until it reaches a live item, giving up on a cycle or a dead end.
export function followReplaced(replaced: Record<string, string>, kind: string, id: string, live: Set<string>): string | undefined {
  const seen = new Set<string>();
  let current = id;
  while (!live.has(current)) {
    if (seen.has(current)) return undefined;
    seen.add(current);
    const next = replaced[`${kind}:${current}`];
    if (next === undefined) return undefined;
    current = next;
  }
  return current;
}

// The ids of each kind's live items, the ones `replaced` tombstones resolve to.
export function liveIds(theme: Theme, kind: ReplaceableKind): Set<string> {
  const items = { scheme: theme.schemes, variant: theme.buttons.variants, textStyle: theme.textStyles, border: theme.borders }[kind];
  return new Set(items.map((item) => item.id));
}

export function liveIdsByKind(theme: Theme): Record<ReplaceableKind, Set<string>> {
  return Object.fromEntries(REPLACEABLE_KINDS.map((kind) => [kind, liveIds(theme, kind)])) as Record<ReplaceableKind, Set<string>>;
}

// The deleted ids of `kind` that `replaced` keeps a tombstone for.
export function replacedIds(replaced: Record<string, string>, kind: ReplaceableKind): string[] {
  return Object.keys(replaced)
    .filter((key) => key.startsWith(`${kind}:`))
    .map((key) => key.slice(kind.length + 1));
}

// What a deleted id of each kind ends up as when its replacement chain is broken.
export const REPLACEMENT_DEFAULTS: Record<ReplaceableKind, string> = { scheme: "default", variant: "primary", textStyle: "body", border: "subtle" };

function normalizeReplaced(stored: unknown, liveIds: Record<ReplaceableKind, Set<string>>): Record<string, string> {
  const raw = isObj(stored) ? stored : {};
  const entries = Object.entries(raw).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string" && /^(scheme|variant|textStyle|border):/.test(entry[0]),
  );
  const flat = Object.fromEntries(entries);
  const out: Record<string, string> = {};
  for (const [key, target] of entries) {
    const [kind, id] = key.split(":") as [ReplaceableKind, string];
    if (!ID_PATTERN.test(id)) continue;
    const live = liveIds[kind];
    // An item that exists again under this id wins over its tombstone.
    if (live.has(id)) continue;
    // Point straight at the item it ends up at, or the built-in default when the chain is broken.
    out[key] = followReplaced(flat, kind, target, live) ?? REPLACEMENT_DEFAULTS[kind];
  }
  return out;
}

export function normalizeTheme(stored: unknown, fallback: Theme = DEFAULT_THEME): Theme {
  const t = isObj(stored) ? stored : {};
  const colors = normalizeColors(t.colors, fallback.colors);
  const colorIds = new Set(colors.map((c) => c.id));
  const firstColor = (colors[0] as ThemeColor).id;
  const gradients = normalizeGradients(t.gradients ?? fallback.gradients, colorIds);
  const gradientIds = new Set(gradients.map((g) => g.id));
  const schemes = normalizeSchemes(t.schemes ?? fallback.schemes, fallback, colorIds, gradientIds, firstColor);
  const fonts = normalizeFonts(t.fonts ?? fallback.fonts, fallback.fonts);
  const textStyles = normalizeTextStyles(t.textStyles, fallback.textStyles, new Set(fonts.map((f) => f.id)));
  const buttons = isObj(t.buttons) ? t.buttons : {};
  const variants = normalizeVariants(buttons.variants ?? fallback.buttons.variants, fallback, colorIds);
  const borders = normalizeBorders(t.borders ?? fallback.borders, fallback, colorIds);
  const card = isObj(t.card) ? t.card : {};
  const cardBorder = card.border === "none" || borders.some((b) => b.id === card.border) ? (card.border as string) : fallback.card.border;

  const theme: Theme = {
    version: 1,
    colors,
    gradients,
    schemes,
    fonts,
    textStyles,
    radii: normalizeRadii(t.radii, fallback.radii),
    buttons: {
      radius: oneOf(buttons.radius, ["sm", "md", "lg", "full"] as const, fallback.buttons.radius),
      weight: weight(buttons.weight, fallback.buttons.weight),
      size: oneOf(buttons.size, Object.keys(BUTTON_SIZES) as (keyof typeof BUTTON_SIZES)[], fallback.buttons.size),
      variants,
    },
    borders,
    card: {
      border: cardBorder,
      sides: normalizeSides(card.sides, fallback.card.sides),
      radius: oneOf(card.radius, ["sm", "md", "lg"] as const, fallback.card.radius),
      shadow: oneOf(card.shadow, Object.keys(CARD_SHADOWS) as (keyof typeof CARD_SHADOWS)[], fallback.card.shadow),
      padding: oneOf(card.padding, Object.keys(CARD_PADDINGS) as (keyof typeof CARD_PADDINGS)[], fallback.card.padding),
    },
    replaced: {},
  };
  theme.replaced = normalizeReplaced(t.replaced, liveIdsByKind(theme));
  return theme;
}
