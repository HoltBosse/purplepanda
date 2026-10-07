import { fontsInUse } from "./fonts.js";
import { followReplaced, liveIdsByKind, replacedIds } from "./normalize.js";
import { gradientCss } from "./resolve.js";
import {
  BORDER_SIDES,
  type BorderPreset,
  type BorderSide,
  BUTTON_SIZES,
  CARD_PADDINGS,
  CARD_SHADOWS,
  NO_BORDER,
  parseRef,
  type Ref,
  type ReplaceableKind,
  ROLES,
  type Role,
  type Theme,
  type ThemeFont,
  type ThemeScheme,
} from "./types.js";
import { units } from "./units.js";

// The theme as CSS, injected into every published page, the preview routes, the editor canvas and
// the theme screen's own preview. All names are prefixed (`--pp-*`, `data-pp-mode`) because the
// admin and the editor iframe also carry daisyUI, which owns `--border` and `data-theme`.
//
// Components only ever reference these names: a Section sets `data-scheme="<id>"`, a Button gets
// `pp-btn pp-btn--<variant>`, text gets `pp-text-<style>`, a bordered surface gets
// `data-pp-border="<preset>"` and `data-pp-sides="top bottom"`. Unknown ids still render: a bare
// `[data-scheme]`, `.pp-btn` or `[data-pp-border]` gets the default scheme, primary variant or
// subtle border, and a deleted id is added to its replacement's selector (see `replaced` in
// ./types.ts).

const ROLE_VAR: Record<Role, string> = {
  bg: "--pp-scheme-bg",
  fg: "--pp-scheme-fg",
  muted: "--pp-scheme-muted",
  btnBg: "--pp-scheme-btn-bg",
  btnFg: "--pp-scheme-btn-fg",
  border: "--pp-scheme-border",
};

export function colorVar(id: string): string {
  return `var(--pp-color-${id})`;
}

export function refCss(ref: Ref): string {
  const target = parseRef(ref);
  if (!target) return "transparent";
  return "role" in target ? `var(${ROLE_VAR[target.role as Role]})` : colorVar(target.color);
}

const FALLBACK_STACKS: Record<string, string> = {
  serif: 'ui-serif, Georgia, "Times New Roman", serif',
  monospace: "ui-monospace, SFMono-Regular, Menlo, monospace",
  handwriting: "cursive",
};
const SANS_STACK = "ui-sans-serif, system-ui, sans-serif";

// A font-family value for a theme font: the family with a fallback stack chosen from its Bunny
// category, or `inherit` when none is set (the browser default, as before themes existed).
export function fontStack(font: ThemeFont): string {
  if (!font.family) return "inherit";
  return `"${font.family}", ${FALLBACK_STACKS[font.category] ?? SANS_STACK}`;
}

export function themeFontLinks(theme: Theme): string[] {
  return [...new Set(fontsInUse(theme).map((f) => f.link).filter(Boolean))];
}

// A radius as a CSS length: "full" is a pill.
export function radiusCss(theme: Theme, key: keyof Theme["radii"]): string {
  const value = theme.radii[key];
  return value === "full" ? "9999px" : units(value);
}

function block(selector: string, declarations: string[]): string {
  return `${selector} {\n${declarations.map((d) => `  ${d};`).join("\n")}\n}`;
}

function borderVars(b: BorderPreset): string[] {
  return [`--pp-border-width: ${b.width}px`, `--pp-border-color: ${refCss(b.color)}`];
}

// A border-width value drawing only `sides`: top and bottom give
// "var(--pp-border-width) 0 var(--pp-border-width) 0".
function sideWidths(sides: readonly BorderSide[]): string {
  return BORDER_SIDES.map((side) => (sides.includes(side) ? "var(--pp-border-width)" : "0")).join(" ");
}

// Each id plus every deleted id that now resolves to it.
function aliases(theme: Theme, kind: ReplaceableKind, id: string, live: Set<string>): string[] {
  const dead = replacedIds(theme.replaced, kind).filter((old) => followReplaced(theme.replaced, kind, old, live) === id);
  return [id, ...dead];
}

export type ThemeCssOptions = {
  // Confines the theme to one element (and its descendants) instead of the whole document, for
  // previews that sit inside the admin UI. The scoped element plays the part of :root and body.
  scope?: string;
};

export function themeToCss(theme: Theme, options: ThemeCssOptions = {}): string {
  const { scope } = options;
  const root = scope ?? ":root";
  const p = (selector: string) => (scope ? selector.split(",").map((s) => `${scope} ${s.trim()}`).join(", ") : selector);

  const palette = (mode: "light" | "dark") => [
    ...theme.colors.map((c) => `--pp-color-${c.id}: ${c[mode]}`),
    ...theme.gradients.map((g) => `--pp-gradient-${g.id}: ${gradientCss(g, colorVar)}`),
    `color-scheme: ${mode}`,
  ];

  const out: string[] = ["/* Generated from the site theme. */"];

  out.push(
    block(root, [
      ...palette("light"),
      ...theme.fonts.map((f) => `--pp-font-${f.id}: ${fontStack(f)}`),
      // The two built-in fonts under their own names too, for anything written against them.
      "--pp-heading-font: var(--pp-font-heading)",
      "--pp-body-font: var(--pp-font-body)",
      ...(["sm", "md", "lg", "full"] as const).map((k) => `--pp-radius-${k}: ${radiusCss(theme, k)}`),
    ]),
  );
  // Dark values follow the visitor's system setting unless something pins a mode with
  // data-pp-mode (the editor's light/dark toggle, the theme screen's preview).
  out.push(`@media (prefers-color-scheme: dark) {\n${block(`${root}:not([data-pp-mode="light"])`, palette("dark"))}\n}`);
  out.push(block(`${root}[data-pp-mode="dark"], ${p('[data-pp-mode="dark"]')}`, palette("dark")));
  out.push(block(`${p('[data-pp-mode="light"]')}`, palette("light")));

  // Body font everywhere, heading font on headings: what the old site-wide font settings did.
  const bodySelector = scope ?? "body";
  out.push(block(bodySelector, ["font-family: var(--pp-body-font)"]));
  out.push(block(p("h1, h2, h3, h4, h5, h6"), ["font-family: var(--pp-heading-font)"]));

  // Schemes. A bare [data-scheme] gets the default's colors, so an id this theme doesn't know
  // still renders. Every scheme sets --pp-scheme-bg-image explicitly (to none without a
  // gradient), so a solid surface nested in a gradient one doesn't inherit the gradient.
  const schemeVars = (s: ThemeScheme) => [
    ...ROLES.map((role) => `${ROLE_VAR[role]}: ${colorVar(s.roles[role])}`),
    `--pp-scheme-bg-image: ${s.gradient && theme.gradients.some((g) => g.id === s.gradient) ? `var(--pp-gradient-${s.gradient})` : "none"}`,
  ];
  const defaultScheme = theme.schemes.find((s) => s.id === "default") ?? theme.schemes[0];
  if (defaultScheme) {
    out.push(
      block(p("[data-scheme]"), [
        ...schemeVars(defaultScheme),
        // Only the element carrying the scheme paints the gradient; nested surfaces use the solid.
        "background-color: var(--pp-scheme-bg)",
        "background-image: var(--pp-scheme-bg-image)",
        "color: var(--pp-scheme-fg)",
      ]),
    );
  }
  const live = liveIdsByKind(theme);
  for (const s of theme.schemes) {
    const selectors = aliases(theme, "scheme", s.id, live.scheme).map((id) => `[data-scheme="${id}"]`);
    out.push(block(p(selectors.join(", ")), schemeVars(s)));
  }
  out.push(block(p(".pp-muted"), ["color: var(--pp-scheme-muted)"]));

  // Buttons. Hover and active mix the variant's background toward its text color, which reads on
  // light and dark backgrounds alike and gives transparent variants a visible tint.
  const size = BUTTON_SIZES[theme.buttons.size];
  out.push(
    block(p(".pp-btn"), [
      "--pp-btn-bg: var(--pp-scheme-btn-bg)",
      "--pp-btn-fg: var(--pp-scheme-btn-fg)",
      "--pp-btn-border: transparent",
      "display: inline-flex",
      "align-items: center",
      "justify-content: center",
      "gap: 0.375rem",
      `min-height: ${units(size.minHeight)}`,
      `padding: ${units(1)} ${units(size.paddingX)}`,
      `font-size: ${units(size.fontSize)}`,
      `font-weight: ${theme.buttons.weight}`,
      "line-height: 1.25",
      "text-align: center",
      "text-decoration: none",
      `border-radius: ${radiusCss(theme, theme.buttons.radius)}`,
      "border: 1px solid var(--pp-btn-border)",
      "background-color: var(--pp-btn-bg)",
      "color: var(--pp-btn-fg)",
      "cursor: pointer",
      "transition: background-color 0.15s, border-color 0.15s, color 0.15s",
    ]),
  );
  out.push(block(p(".pp-btn:hover"), ["background-color: color-mix(in oklab, var(--pp-btn-bg), var(--pp-btn-fg) 12%)"]));
  out.push(
    block(p(".pp-btn:active"), ["background-color: color-mix(in oklab, var(--pp-btn-bg), var(--pp-btn-fg) 20%)", "translate: 0 0.5px"]),
  );
  out.push(block(p(".pp-btn:focus-visible"), ["outline: 2px solid var(--pp-scheme-fg)", "outline-offset: 2px"]));
  out.push(`@media (prefers-reduced-motion: reduce) {\n${block(p(".pp-btn"), ["transition: none"])}\n}`);
  for (const v of theme.buttons.variants) {
    const selectors = aliases(theme, "variant", v.id, live.variant).map((id) => `.pp-btn--${id}`);
    out.push(
      block(p(selectors.join(", ")), [`--pp-btn-bg: ${refCss(v.bg)}`, `--pp-btn-fg: ${refCss(v.fg)}`, `--pp-btn-border: ${refCss(v.border)}`]),
    );
  }

  // Text styles. Rich text's own h1–h3 and paragraphs take the matching built-in style, and a rich
  // text block or paragraph given a style of its own (data-text-style, set from the editor's menu)
  // takes that one; the attribute selector outranks the tag ones. Deleted ids join their
  // replacement's selectors.
  const richTags: Record<string, string> = { h1: "h1", h2: "h2", h3: "h3", body: "p" };
  for (const t of theme.textStyles) {
    const declarations = [
      `font-family: var(--pp-font-${t.font})`,
      `font-size: ${units(t.size)}`,
      `font-weight: ${t.weight}`,
      `line-height: ${t.lineHeight}`,
    ];
    const tag = richTags[t.id];
    if (tag) out.push(block(p(`.pp-rich ${tag}`), declarations));
    const ids = aliases(theme, "textStyle", t.id, live.textStyle);
    out.push(block(p(ids.flatMap((id) => [`.pp-text-${id}`, `.pp-rich [data-text-style="${id}"]`]).join(", ")), declarations));
  }
  // Tailwind Typography colors rich text itself; point it at the surrounding scheme instead.
  out.push(
    block(p(".pp-rich"), [
      "--tw-prose-body: var(--pp-scheme-fg)",
      "--tw-prose-headings: var(--pp-scheme-fg)",
      "--tw-prose-lead: var(--pp-scheme-muted)",
      "--tw-prose-links: var(--pp-scheme-fg)",
      "--tw-prose-bold: var(--pp-scheme-fg)",
      "--tw-prose-counters: var(--pp-scheme-muted)",
      "--tw-prose-bullets: var(--pp-scheme-muted)",
      "--tw-prose-hr: var(--pp-scheme-border)",
      "--tw-prose-quotes: var(--pp-scheme-fg)",
      "--tw-prose-quote-borders: var(--pp-scheme-border)",
      "--tw-prose-captions: var(--pp-scheme-muted)",
      "--tw-prose-code: var(--pp-scheme-fg)",
      "--tw-prose-th-borders: var(--pp-scheme-border)",
      "--tw-prose-td-borders: var(--pp-scheme-border)",
    ]),
  );

  // Cards. A card without a scheme of its own takes the surrounding scheme's solid background, and
  // one without a border of its own takes the theme's card border on the theme's card sides.
  const card = theme.card;
  const cardBorder = theme.borders.find((b) => b.id === card.border);
  out.push(
    block(p(".pp-card"), [
      "background-color: var(--pp-scheme-bg)",
      "color: var(--pp-scheme-fg)",
      `border-radius: ${radiusCss(theme, card.radius)}`,
      `padding: ${units(CARD_PADDINGS[card.padding].padding)}`,
      `box-shadow: ${CARD_SHADOWS[card.shadow].css}`,
      ...(cardBorder ? [...borderVars(cardBorder), "border-style: solid", "border-color: var(--pp-border-color)", `border-width: ${sideWidths(card.sides)}`] : ["border: none"]),
    ]),
  );

  // Border presets, after cards so a card's own border wins over the theme's. Width and color go
  // through variables so the sides rules below can draw just some edges. A bare [data-pp-border]
  // gets Subtle, so an id this theme doesn't know still draws a border.
  const borderRule = (b: BorderPreset) => [...borderVars(b), "border: var(--pp-border-width) solid var(--pp-border-color)"];
  const defaultBorder = theme.borders.find((b) => b.id === "subtle") ?? theme.borders[0];
  if (defaultBorder) out.push(block(p("[data-pp-border]"), borderRule(defaultBorder)));
  for (const b of theme.borders) {
    const selectors = aliases(theme, "border", b.id, live.border).map((id) => `[data-pp-border="${id}"]`);
    out.push(block(p(selectors.join(", ")), borderRule(b)));
  }
  out.push(block(p(`[data-pp-border="${NO_BORDER}"]`), ["border: none"]));
  // Sides: a listed edge keeps the preset's width, the rest get none.
  out.push(block(p("[data-pp-sides]"), ["border-width: 0"]));
  for (const side of BORDER_SIDES) out.push(block(p(`[data-pp-sides~="${side}"]`), [`border-${side}-width: var(--pp-border-width)`]));

  return `${out.join("\n")}\n`;
}
