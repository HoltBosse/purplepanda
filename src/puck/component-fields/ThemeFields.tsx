import { type CustomField, type Field, FieldLabel } from "@puckeditor/core";
import type { CSSProperties, ReactNode } from "react";
import { BORDER_SIDES, type BorderSide, NO_BORDER, REPLACEMENT_DEFAULTS, type ReplaceableKind } from "../../theme/index.js";
import { normalizeSides } from "../../theme/normalize.js";
import { DEFAULT_THEME } from "../../theme/presets.js";
import { getInjectedTheme, type ThemeSummary, themeSummary } from "../../theme/summary.js";
import { units } from "../../theme/units.js";
import { TriangleAlert } from "../icons.js";

// The style fields a component can take from the site theme: a scheme (containers), a button
// variant, a text style, a border preset. Each stores only the theme item's id and shows real swatches and styled
// samples from the published theme (injected by ThemeScript.astro), not a plain dropdown.
// Components opt into exactly the ones they need through themeStyleFields() below.

let fallbackSummary: ThemeSummary | undefined;

// Outside the admin (and in tests) nothing is injected, so the default preset stands in.
export function currentTheme(): ThemeSummary {
  const injected = getInjectedTheme();
  if (injected) return injected;
  fallbackSummary ??= themeSummary(DEFAULT_THEME);
  return fallbackSummary;
}

// What each kind falls back to when a stored id is gone and has no replacement (the built-in
// REPLACEMENT_DEFAULTS item), by name.
const FALLBACK_NAMES: Record<ReplaceableKind, string> = { scheme: "Default", variant: "Primary", textStyle: "Body", border: "Subtle" };

function themeItems(theme: ThemeSummary, kind: ReplaceableKind): { id: string; name: string }[] {
  return kind === "scheme" ? theme.schemes : kind === "variant" ? theme.variants : kind === "border" ? theme.borders : theme.textStyles;
}

// The default scheme's light swatch, the backdrop the variant and border samples are shown on.
function baseSwatch(theme: ThemeSummary) {
  return theme.schemes.find((s) => s.id === REPLACEMENT_DEFAULTS.scheme)?.swatch.light;
}

// A warning for a stored id the theme no longer has: where it now renders as, if it was deleted
// and replaced, or that it falls back to the default.
function MissingNotice({ kind, value, theme }: { kind: ReplaceableKind; value: string; theme: ThemeSummary }) {
  const replacement = theme.replaced[`${kind}:${value}`];
  const target = themeItems(theme, kind).find((item) => item.id === replacement)?.name ?? FALLBACK_NAMES[kind];
  return (
    <p role="status" data-theme-field-missing className="flex items-start gap-1.5 text-xs text-warning mb-2">
      <TriangleAlert className="size-3.5 shrink-0 mt-px" aria-hidden="true" />
      <span>
        “{value}” is no longer in the site theme. It shows as {target} until you pick another.
      </span>
    </p>
  );
}

function Option({
  selected,
  onSelect,
  readOnly,
  label,
  children,
  style,
}: {
  selected: boolean;
  onSelect: () => void;
  readOnly?: boolean | undefined;
  label: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={label}
      title={label}
      disabled={readOnly}
      onClick={onSelect}
      className={`rounded-md border text-left overflow-hidden transition-colors ${
        selected ? "border-primary ring-2 ring-primary/40" : "border-base-300 hover:border-base-content/40"
      }`}
      style={style}
    >
      {children}
    </button>
  );
}

// The frame every theme style field shares: its label, a warning when the stored id (`missing`) is
// no longer in the theme, and a fieldset of the choices (`children`).
function ThemeFieldShell({
  kind,
  label,
  readOnly,
  theme,
  missing,
  className,
  style,
  children,
}: {
  kind: ReplaceableKind;
  label: string;
  readOnly: boolean | undefined;
  theme: ThemeSummary;
  missing: string | false | undefined;
  className: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <FieldLabel label={label} el="div" readOnly={!!readOnly}>
      <div data-theme-field={kind}>
        {missing && <MissingNotice kind={kind} value={missing} theme={theme} />}
        <fieldset className={className} style={style}>
          <legend className="sr-only">{label}</legend>
          {children}
        </fieldset>
      </div>
    </FieldLabel>
  );
}

// The choice stored as "" when a field allows it: a plain tile with `text` in its sample and caption.
function EmptyOption({
  text,
  height,
  selected,
  onSelect,
  readOnly,
}: {
  text: string;
  height: string;
  selected: boolean;
  onSelect: () => void;
  readOnly: boolean | undefined;
}) {
  return (
    <Option selected={selected} onSelect={onSelect} readOnly={readOnly} label={text}>
      <span className={`flex ${height} items-center justify-center bg-base-200 text-xs text-base-content/70`}>{text}</span>
      <span className="block px-2 py-1 text-xs bg-base-100">{text}</span>
    </Option>
  );
}

type SchemeFieldOptions = {
  label?: string;
  // Offers "Inherit" (stored as ""), for surfaces that should take the scheme around them.
  allowInherit?: boolean;
};

export function schemeField({ label = "Color scheme", allowInherit = false }: SchemeFieldOptions = {}): CustomField<string | undefined> {
  return {
    type: "custom",
    label,
    render: ({ value, onChange, readOnly }) => {
      const theme = currentTheme();
      const missing = value && !theme.schemes.some((s) => s.id === value) && value;
      return (
        <ThemeFieldShell kind="scheme" label={label} readOnly={readOnly} theme={theme} missing={missing} className="grid grid-cols-2 gap-2">
          {allowInherit && <EmptyOption text="Inherit" height="h-12" selected={!value} onSelect={() => onChange("")} readOnly={readOnly} />}
          {theme.schemes.map((scheme) => {
            const swatch = scheme.swatch.light;
            return (
              <Option key={scheme.id} selected={value === scheme.id} onSelect={() => onChange(scheme.id)} readOnly={readOnly} label={scheme.name}>
                <span className="flex h-12 items-center gap-1.5 px-2" style={{ background: swatch.fill, color: swatch.fg }} aria-hidden="true">
                  <span className="text-sm font-semibold">Aa</span>
                  <span className="h-3 w-6 rounded-sm" style={{ background: swatch.btnBg }} />
                  <span className="text-[10px]" style={{ color: swatch.muted }}>
                    text
                  </span>
                </span>
                <span className="block truncate px-2 py-1 text-xs bg-base-100">{scheme.name}</span>
              </Option>
            );
          })}
        </ThemeFieldShell>
      );
    },
  };
}

export function variantField({ label = "Style" }: { label?: string } = {}): CustomField<string | undefined> {
  return {
    type: "custom",
    label,
    render: ({ value, onChange, readOnly }) => {
      const theme = currentTheme();
      const current = value || REPLACEMENT_DEFAULTS.variant;
      const missing = !theme.variants.some((v) => v.id === current) && current;
      const base = baseSwatch(theme);
      return (
        <ThemeFieldShell
          kind="variant"
          label={label}
          readOnly={readOnly}
          theme={theme}
          missing={missing}
          className="flex flex-wrap gap-2 rounded-md p-2"
          style={{ background: base?.fill }}
        >
          {theme.variants.map((variant) => {
            const swatch = variant.swatch.light;
            const selected = current === variant.id;
            return (
              <button
                key={variant.id}
                type="button"
                aria-pressed={selected}
                disabled={readOnly}
                onClick={() => onChange(variant.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold outline-offset-2 ${selected ? "outline-2 outline-primary" : ""}`}
                style={{ background: swatch.bg, color: swatch.fg === "inherit" ? base?.fg : swatch.fg, border: `1px solid ${swatch.border}` }}
              >
                {variant.name}
              </button>
            );
          })}
        </ThemeFieldShell>
      );
    },
  };
}

export function textStyleField({ label = "Text style", allowNone = false }: { label?: string; allowNone?: boolean } = {}): CustomField<
  string | undefined
> {
  return {
    type: "custom",
    label,
    render: ({ value, onChange, readOnly }) => {
      const theme = currentTheme();
      const missing = value && !theme.textStyles.some((t) => t.id === value) && value;
      return (
        <ThemeFieldShell kind="textStyle" label={label} readOnly={readOnly} theme={theme} missing={missing} className="flex flex-col gap-1">
          {allowNone && (
            <Option selected={!value} onSelect={() => onChange("")} readOnly={readOnly} label="None">
              <span className="block px-2 py-1.5 text-sm text-base-content/70">None</span>
            </Option>
          )}
          {theme.textStyles.map((style) => (
            <Option key={style.id} selected={value === style.id} onSelect={() => onChange(style.id)} readOnly={readOnly} label={style.name}>
              <span
                className="block truncate px-2 py-1"
                style={{
                  fontFamily: style.fontFamily,
                  // Capped so Display doesn't blow out the side panel.
                  fontSize: `min(${units(style.size)}, 1.75rem)`,
                  fontWeight: style.weight,
                  lineHeight: 1.2,
                }}
              >
                {style.name}
              </span>
            </Option>
          ))}
        </ThemeFieldShell>
      );
    },
  };
}

type BorderFieldOptions = {
  label?: string;
  // Offers "Theme default" (stored as ""), for surfaces the theme already gives a border (cards).
  // Without it, "" reads as no border.
  allowInherit?: boolean;
};

// A border preset from the theme, "none", or (with allowInherit) "" for the theme's own choice.
// Which sides it goes on is a separate prop: see borderSidesField.
export function borderField({ label = "Border", allowInherit = false }: BorderFieldOptions = {}): CustomField<string | undefined> {
  return {
    type: "custom",
    label,
    render: ({ value, onChange, readOnly }) => {
      const theme = currentTheme();
      const missing = value && value !== NO_BORDER && !theme.borders.some((b) => b.id === value) && value;
      const base = baseSwatch(theme);
      const sample = (border: string) => (
        <span className="flex h-10 items-center justify-center" style={{ background: base?.fill }} aria-hidden="true">
          <span className="h-6 w-10 rounded-sm" style={{ border }} />
        </span>
      );
      return (
        <ThemeFieldShell kind="border" label={label} readOnly={readOnly} theme={theme} missing={missing} className="grid grid-cols-2 gap-2">
          {allowInherit && <EmptyOption text="Theme default" height="h-10" selected={!value} onSelect={() => onChange("")} readOnly={readOnly} />}
          <Option selected={value === NO_BORDER || (!allowInherit && !value)} onSelect={() => onChange(NO_BORDER)} readOnly={readOnly} label="None">
            {sample("1px dashed transparent")}
            <span className="block px-2 py-1 text-xs bg-base-100">None</span>
          </Option>
          {theme.borders.map((border) => (
            <Option key={border.id} selected={value === border.id} onSelect={() => onChange(border.id)} readOnly={readOnly} label={border.name}>
              {sample(`${border.width}px solid ${border.swatch.light.color}`)}
              <span className="block truncate px-2 py-1 text-xs bg-base-100">{border.name}</span>
            </Option>
          ))}
        </ThemeFieldShell>
      );
    },
  };
}

// The edges of the sides preview, each a thin bar.
const EDGE_BARS: Record<BorderSide, string> = {
  top: "top-1 inset-x-3 h-1",
  bottom: "bottom-1 inset-x-3 h-1",
  left: "left-1 inset-y-3 w-1",
  right: "right-1 inset-y-3 w-1",
};

// Every choice of sides, in the order clicking the preview steps through them.
const SIDE_OPTIONS: { label: string; sides: readonly BorderSide[] }[] = [
  { label: "All", sides: BORDER_SIDES },
  { label: "Top & bottom", sides: ["top", "bottom"] },
  { label: "Left & right", sides: ["right", "left"] },
  { label: "Top", sides: ["top"] },
  { label: "Right", sides: ["right"] },
  { label: "Bottom", sides: ["bottom"] },
  { label: "Left", sides: ["left"] },
];

// Which edges carry a border: a preview of the current sides, which steps to the next option when
// clicked, plus a button for every option. Also used by the theme screen for the card's default
// sides. A stored combination that isn't one of the options (top and left, say) still renders, and
// the preview starts over from All.
export function SidesPicker({
  value,
  onChange,
  readOnly,
  label = "Border sides",
}: {
  value: readonly BorderSide[] | undefined;
  onChange: (sides: BorderSide[]) => void;
  readOnly?: boolean | undefined;
  label?: string;
}) {
  const sides = normalizeSides(value, BORDER_SIDES);
  const current = SIDE_OPTIONS.findIndex((o) => o.sides.length === sides.length && o.sides.every((s) => sides.includes(s)));
  const choose = (option: (typeof SIDE_OPTIONS)[number]) => onChange(BORDER_SIDES.filter((s) => option.sides.includes(s)));
  const next = SIDE_OPTIONS[(current + 1) % SIDE_OPTIONS.length] as (typeof SIDE_OPTIONS)[number];
  return (
    <fieldset className="flex items-center gap-3" data-sides-picker>
      <legend className="sr-only">{label}</legend>
      <button
        type="button"
        aria-label={`${SIDE_OPTIONS[current]?.label ?? "Custom"}. Switch to ${next.label}`}
        title={`Switch to ${next.label}`}
        disabled={readOnly}
        onClick={() => choose(next)}
        className="group relative size-16 shrink-0 rounded-sm bg-base-200 hover:bg-base-300 transition-colors"
        data-sides-preview
      >
        {BORDER_SIDES.map((side) => (
          <span
            key={side}
            aria-hidden="true"
            className={`absolute rounded-full transition-colors ${EDGE_BARS[side]} ${sides.includes(side) ? "bg-primary" : "bg-base-content/15"}`}
          />
        ))}
      </button>
      <div className="flex flex-wrap gap-1">
        {SIDE_OPTIONS.map((option, index) => (
          <button
            key={option.label}
            type="button"
            aria-pressed={index === current}
            disabled={readOnly}
            onClick={() => choose(option)}
            className={`btn btn-xs ${index === current ? "btn-primary" : "btn-ghost border-base-300"}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function borderSidesField({ label = "Border sides" }: { label?: string } = {}): CustomField<BorderSide[] | undefined> {
  return {
    type: "custom",
    label,
    render: ({ value, onChange, readOnly }) => (
      <FieldLabel label={label} el="div" readOnly={!!readOnly}>
        <div data-theme-field="borderSides">
          <SidesPicker value={value} onChange={onChange} readOnly={readOnly} label={label} />
        </div>
      </FieldLabel>
    ),
  };
}

type StyleFieldOptions = {
  scheme?: SchemeFieldOptions;
  variant?: { label?: string };
  textStyle?: { label?: string; allowNone?: boolean };
  border?: BorderFieldOptions;
};

// The theme style fields a component asks for, ready to spread into its `fields`. E.g. a Section
// takes `themeStyleFields({ scheme: {} })`, a Button `themeStyleFields({ variant: {} })`.
export function themeStyleFields<const TOptions extends StyleFieldOptions>(
  options: TOptions,
): { [TName in keyof TOptions & keyof StyleFieldOptions]: Field<any> } {
  const fields: Partial<Record<keyof StyleFieldOptions, Field<any>>> = {};
  if (options.scheme) fields.scheme = schemeField(options.scheme);
  if (options.variant) fields.variant = variantField(options.variant);
  if (options.textStyle) fields.textStyle = textStyleField(options.textStyle);
  if (options.border) fields.border = borderField(options.border);
  return fields as { [TName in keyof TOptions & keyof StyleFieldOptions]: Field<any> };
}

// Class names for the stored ids, matching the generated theme CSS (see theme/css.ts). Unknown or
// deleted ids are left as they are: the CSS maps them onto their replacement or the default.
export function variantClass(variant: string | undefined): string {
  return `pp-btn pp-btn--${variant || REPLACEMENT_DEFAULTS.variant}`;
}

export function textStyleClass(textStyle: string | undefined): string | undefined {
  return textStyle ? `pp-text-${textStyle}` : undefined;
}

// Attributes for a stored border and its sides, matching the generated theme CSS. No border (or
// "" on a card, where it means the theme's card border) adds nothing.
export function borderAttrs(border: string | undefined, sides: readonly BorderSide[] | undefined): Record<string, string> {
  if (!border) return {};
  if (border === NO_BORDER) return { "data-pp-border": NO_BORDER };
  return { "data-pp-border": border, "data-pp-sides": normalizeSides(sides, BORDER_SIDES).join(" ") };
}

// Hides a component's sides field while it has no border of its own to put on them.
export function withoutIdleSides<TFields extends { borderSides?: unknown }>(fields: TFields, border: string | undefined): TFields {
  if (border && border !== NO_BORDER) return fields;
  const { borderSides: _, ...rest } = fields;
  return rest as TFields;
}
