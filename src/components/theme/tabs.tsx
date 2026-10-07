import { useState } from "react";
import { SidesPicker } from "../../puck/component-fields/ThemeFields.js";
import { Check, TriangleAlert, X } from "../../puck/icons.js";
import {
  BUTTON_SIZES,
  type ButtonSize,
  CARD_PADDINGS,
  CARD_SHADOWS,
  type CardPadding,
  type CardShadow,
  colorHex,
  colorUsage,
  deleteGradient,
  FONT_WEIGHTS,
  fontRole,
  fontStack,
  fontUsage,
  HEX_PATTERN,
  MAX_FONTS,
  type Mode,
  NO_BORDER,
  NO_FONT,
  type RadiusKey,
  type ReplaceableKind,
  ROLE_LABELS,
  ROLES,
  radiusCss,
  refHex,
  replacedIds,
  schemeContrastIssues,
  schemeFill,
  type Theme,
  type ThemeFont,
  type ThemeFontRole,
  type ThemeScheme,
  uniqueId,
  units,
} from "../../theme/index.js";
import { AddByName, ColorSelect, LockOrDelete, Panel, pluralize, RefSelect, Swatch, UnitsInput } from "./editor-ui.js";
import { FontPickerDialog } from "./FontPickerDialog.js";

export type DeletableKind = "color" | "font" | "scheme" | "variant" | "textStyle" | "border";

export type TabProps = {
  theme: Theme;
  update: (change: (working: Theme) => void) => void;
  mode: Mode;
  // Documents using a scheme, variant, text style or border (counting deleted ids that now resolve to it).
  usageOf: (kind: ReplaceableKind, id: string) => number;
  requestDelete: (kind: DeletableKind, id: string) => void;
  notify: (message: string) => void;
};

// Every id taken in a list, tombstoned ones included, so a new item never reuses a deleted id.
function takenIds(theme: Theme, kind: ReplaceableKind, ids: string[]): string[] {
  return [...ids, ...replacedIds(theme.replaced, kind)];
}

// How many documents use a scheme, variant or border preset.
function usageText(n: number): string {
  return n ? `Used in ${pluralize(n, "document")}` : "Not used yet";
}

function HexInput({ value, onChange, label }: { value: string; onChange: (hex: string) => void; label: string }) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  const shown = focused ? text : value;
  const valid = HEX_PATTERN.test(shown);
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        className="w-8 h-8 rounded cursor-pointer bg-transparent shrink-0 border border-base-300 p-0.5"
        aria-label={`${label} picker`}
        value={value}
        onChange={(e) => onChange(e.target.value.toLowerCase())}
      />
      <input
        className={`input input-sm w-24 font-mono ${valid ? "" : "input-error"}`}
        aria-label={`${label} hex`}
        value={shown}
        onFocus={() => {
          setText(value);
          setFocused(true);
        }}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          setText(e.target.value);
          if (HEX_PATTERN.test(e.target.value)) onChange(e.target.value.toLowerCase());
        }}
      />
    </div>
  );
}

/* ---------- Colors and gradients ---------- */

export function ColorsTab({ theme, update, requestDelete }: TabProps) {
  return (
    <>
      <Panel
        title="Colors"
        description="Every color has a light and a dark value. Schemes and button variants pick from this list, so changing a value here updates every page that uses it. Dark values show to visitors whose device is set to dark mode."
        action={
          <AddByName
            label="Add color"
            placeholder="e.g. Sea glass"
            onAdd={(name) =>
              update((t) => {
                t.colors.push({ id: uniqueId(name, t.colors.map((c) => c.id)), name, light: "#7a7a8c", dark: "#a3a3b5" });
              })
            }
          />
        }
      >
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Name</th>
                <th>Light mode</th>
                <th>Dark mode</th>
                <th>Used by</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {theme.colors.map((c, i) => {
                const n = colorUsage(theme, c.id);
                return (
                  <tr key={c.id} data-color={c.id}>
                    <td>
                      <input
                        className="input input-sm w-36"
                        aria-label="Color name"
                        value={c.name}
                        onChange={(e) => update((t) => {
                          (t.colors[i] as typeof c).name = e.target.value;
                        })}
                      />
                    </td>
                    <td>
                      <HexInput label={`${c.name} light`} value={c.light} onChange={(hex) => update((t) => {
                        (t.colors[i] as typeof c).light = hex;
                      })} />
                    </td>
                    <td>
                      <HexInput label={`${c.name} dark`} value={c.dark} onChange={(hex) => update((t) => {
                        (t.colors[i] as typeof c).dark = hex;
                      })} />
                    </td>
                    <td className="text-sm text-base-content/60 whitespace-nowrap">{n ? pluralize(n, "use") : "Unused"}</td>
                    <td className="text-right">
                      {theme.colors.length > 1 && <LockOrDelete label={c.name} onDelete={() => requestDelete("color", c.id)} />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      <GradientsPanel theme={theme} update={update} />
    </>
  );
}

function GradientsPanel({ theme, update }: Pick<TabProps, "theme" | "update">) {
  const first = theme.colors[0]?.id ?? "";
  const last = theme.colors[theme.colors.length - 1]?.id ?? first;
  return (
    <Panel
      title="Gradients"
      description="Built from your colors, so each gradient has a light and dark version automatically. Schemes can use a gradient as their background."
      action={
        <AddByName
          label="Add gradient"
          placeholder="e.g. Sunrise"
          onAdd={(name) =>
            update((t) => {
              t.gradients.push({
                id: uniqueId(name, t.gradients.map((g) => g.id)),
                name,
                type: "linear",
                angle: 90,
                stops: [
                  { color: first, at: 0 },
                  { color: last, at: 100 },
                ],
              });
            })
          }
        />
      }
    >
      {theme.gradients.length === 0 && <p className="text-sm text-base-content/60">No gradients yet.</p>}
      <div className="flex flex-col gap-4">
        {theme.gradients.map((g, i) => {
          const n = theme.schemes.filter((s) => s.gradient === g.id).length;
          const css = (m: Mode) => schemeFill(theme, { id: "", name: "", gradient: g.id, roles: { bg: first, fg: first, muted: first, btnBg: first, btnFg: first, border: first } }, m);
          const set = (change: (gradient: typeof g) => void) => update((t) => change(t.gradients[i] as typeof g));
          return (
            <div key={g.id} className="border border-base-300 rounded-lg p-4 grid gap-4 md:grid-cols-[180px_minmax(0,1fr)]" data-gradient={g.id}>
              <div className="flex flex-col gap-2">
                <div className="h-16 rounded-md border border-base-300" style={{ background: css("light") }} title="Light mode" aria-hidden="true" />
                <div className="h-16 rounded-md border border-base-300" style={{ background: css("dark") }} title="Dark mode" aria-hidden="true" />
                <div className="flex justify-between text-xs text-base-content/60">
                  <span>Light</span>
                  <span>Dark</span>
                </div>
              </div>
              <div className="flex flex-col gap-3 min-w-0">
                <div className="flex items-center gap-2">
                  <input className="input input-sm flex-1 font-medium" aria-label="Gradient name" value={g.name} onChange={(e) => set((x) => {
                    x.name = e.target.value;
                  })} />
                  <span className="text-xs text-base-content/60 whitespace-nowrap">{n ? pluralize(n, "scheme") : "Unused"}</span>
                  <LockOrDelete
                    label={g.name}
                    onDelete={() =>
                      update((t) => {
                        Object.assign(t, deleteGradient(t, g.id));
                      })
                    }
                  />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="join">
                    {(["linear", "radial"] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        className={`btn btn-sm join-item ${g.type === type ? "btn-active btn-neutral" : ""}`}
                        aria-pressed={g.type === type}
                        onClick={() => set((x) => {
                          x.type = type;
                        })}
                      >
                        {type === "linear" ? "Linear" : "Radial"}
                      </button>
                    ))}
                  </div>
                  {g.type === "linear" ? (
                    <label className="flex items-center gap-2 text-sm text-base-content/70">
                      Angle
                      <input
                        type="range"
                        min={0}
                        max={360}
                        step={15}
                        className="range range-xs w-32"
                        aria-label="Angle"
                        value={g.angle}
                        onChange={(e) => set((x) => {
                          x.angle = Number(e.target.value);
                        })}
                      />
                      <span className="w-10 text-right tabular-nums">{g.angle}°</span>
                    </label>
                  ) : (
                    <span className="text-sm text-base-content/60">Glows from the top left</span>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  {g.stops.map((stop, j) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: stops have no identity beyond their position
                    <div key={j} className="flex items-center gap-2">
                      <Swatch theme={theme} id={stop.color} />
                      <ColorSelect
                        theme={theme}
                        label={`Stop ${j + 1} color`}
                        className="select select-sm flex-1 min-w-0"
                        value={stop.color}
                        onChange={(id) => set((x) => {
                          (x.stops[j] as typeof stop).color = id;
                        })}
                      />
                      <label className="input input-sm w-24 shrink-0">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          aria-label={`Stop ${j + 1} position`}
                          value={stop.at}
                          onChange={(e) => {
                            const at = Number.parseInt(e.target.value, 10);
                            if (Number.isFinite(at)) set((x) => {
                              (x.stops[j] as typeof stop).at = Math.min(100, Math.max(0, at));
                            });
                          }}
                        />
                        <span className="text-base-content/50">%</span>
                      </label>
                      {g.stops.length > 2 ? (
                        <button type="button" className="btn btn-ghost btn-sm btn-square" aria-label={`Remove stop ${j + 1}`} onClick={() => set((x) => void x.stops.splice(j, 1))}>
                          <X className="w-4 h-4" aria-hidden="true" />
                        </button>
                      ) : (
                        <span className="w-8 shrink-0" />
                      )}
                    </div>
                  ))}
                </div>
                {g.stops.length < 4 && (
                  <div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => set((x) => void x.stops.push({ color: x.stops[x.stops.length - 1]?.color ?? first, at: 100 }))}
                    >
                      Add stop
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/* ---------- Schemes ---------- */

function ContrastBadges({ theme, scheme }: { theme: Theme; scheme: ThemeScheme }) {
  return (
    <>
      {(["light", "dark"] as const).map((m) => {
        const issues = schemeContrastIssues(theme, scheme, m);
        const label = m === "light" ? "Light" : "Dark";
        return issues.length ? (
          <span key={m} className="badge badge-sm badge-warning badge-soft gap-1 h-auto py-0.5" data-contrast={m} data-contrast-ok="false">
            <TriangleAlert className="w-3 h-3 shrink-0" aria-hidden="true" />
            {label}: low contrast on {issues.map((x) => `${x.label} ${x.ratio.toFixed(1)}:1`).join(", ")}
          </span>
        ) : (
          <span key={m} className="badge badge-sm badge-success badge-soft gap-1" data-contrast={m} data-contrast-ok="true">
            <Check className="w-3 h-3" aria-hidden="true" />
            {label} readable
          </span>
        );
      })}
    </>
  );
}

export function SchemesTab({ theme, update, mode, usageOf, requestDelete }: TabProps) {
  const radius = radiusCss(theme, theme.buttons.radius);
  return (
    <Panel
      title="Schemes"
      description="A scheme is a matched set of colors for one surface. Editors pick a scheme on a section or card, and everything inside it follows. Swatches show the current preview mode."
      action={
        <AddByName
          label="Add scheme"
          placeholder="e.g. Highlight"
          onAdd={(name) =>
            update((t) => {
              const base = t.schemes[0] as ThemeScheme;
              t.schemes.push({ id: uniqueId(name, takenIds(t, "scheme", t.schemes.map((s) => s.id))), name, roles: { ...base.roles } });
            })
          }
        />
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        {theme.schemes.map((s, i) => {
          const hex = (role: keyof ThemeScheme["roles"]) => colorHex(theme, s.roles[role], mode);
          const n = usageOf("scheme", s.id);
          const set = (change: (scheme: ThemeScheme) => void) => update((t) => change(t.schemes[i] as ThemeScheme));
          return (
            <div key={s.id} className="border border-base-300 rounded-lg overflow-hidden flex flex-col" data-scheme-card={s.id}>
              <div className="p-4" style={{ background: schemeFill(theme, s, mode), color: hex("fg") }}>
                <div style={{ fontFamily: fontStack(fontRole(theme, "heading")), fontSize: "1.3rem", fontWeight: 600, lineHeight: 1.2 }}>Lake days ahead</div>
                <div className="text-sm mt-1" style={{ color: hex("muted") }}>
                  Muted supporting text
                </div>
                <div className="mt-3 flex gap-2 flex-wrap">
                  <span className="px-3 py-1.5 text-sm font-semibold" style={{ borderRadius: radius, background: hex("btnBg"), color: hex("btnFg") }}>
                    Primary
                  </span>
                  <span className="px-3 py-1.5 text-sm" style={{ borderRadius: radius, border: `1px solid ${hex("border")}`, color: hex("fg") }}>
                    Secondary
                  </span>
                </div>
              </div>
              <div className="p-4 flex flex-col gap-3 flex-1">
                <div className="flex items-center gap-2">
                  <input className="input input-sm flex-1 font-medium" aria-label="Scheme name" value={s.name} onChange={(e) => set((x) => {
                    x.name = e.target.value;
                  })} />
                  <LockOrDelete builtin={s.builtin} label={s.name} onDelete={() => requestDelete("scheme", s.id)} />
                </div>
                <div className="text-xs text-base-content/60">
                  {usageText(n)}
                  {s.builtin ? ". New sections start with this scheme." : ""}
                </div>
                <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2">
                  <label className="text-sm text-base-content/70 self-center" htmlFor={`sg-${s.id}`}>
                    Fill
                  </label>
                  <select
                    id={`sg-${s.id}`}
                    className="select select-sm w-full min-w-0"
                    value={s.gradient ?? ""}
                    onChange={(e) =>
                      set((x) => {
                        if (e.target.value) x.gradient = e.target.value;
                        else delete x.gradient;
                      })
                    }
                  >
                    <option value="">Solid color</option>
                    {theme.gradients.map((g) => (
                      <option key={g.id} value={g.id}>
                        Gradient: {g.name}
                      </option>
                    ))}
                  </select>
                  {ROLES.map((role) => (
                    <div key={role} className="contents">
                      <label className="text-sm text-base-content/70 self-center" htmlFor={`sr-${s.id}-${role}`}>
                        {role === "bg" && s.gradient ? "Solid fallback" : ROLE_LABELS[role]}
                      </label>
                      <div className="flex items-center gap-2 min-w-0">
                        <Swatch theme={theme} id={s.roles[role]} />
                        <ColorSelect id={`sr-${s.id}-${role}`} theme={theme} label={ROLE_LABELS[role]} value={s.roles[role]} onChange={(id) => set((x) => {
                          x.roles[role] = id;
                        })} />
                      </div>
                    </div>
                  ))}
                </div>
                {s.gradient && <p className="text-xs text-base-content/60">Cards and other surfaces nested inside use the solid fallback, not the gradient.</p>}
                <div className="flex flex-wrap gap-1.5 mt-auto pt-1">
                  <ContrastBadges theme={theme} scheme={s} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

/* ---------- Typography ---------- */

function weightOptions(font: ThemeFont): number[] {
  return font.weights.length > 0 ? font.weights : [...FONT_WEIGHTS];
}

// Past this many fonts the theme screen warns: each one is another download for every visitor.
const FONT_SOFT_LIMIT = 4;

function FontRow({ font, index, theme, update, presets, requestDelete }: { font: ThemeFontRole; index: number; theme: Theme; update: TabProps["update"]; presets: string[]; requestDelete: TabProps["requestDelete"] }) {
  const [open, setOpen] = useState(false);
  const set = (change: (f: ThemeFontRole) => void) => update((t) => change(t.fonts[index] as ThemeFontRole));
  const users = fontUsage(theme, font.id);
  const note =
    font.id === "heading"
      ? "Headings everywhere, plus the text styles that use it."
      : font.id === "body"
        ? "The page itself and buttons, plus the text styles that use it."
        : users
          ? `Used by ${pluralize(users, "text style")}.`
          : "Not used by any text style yet, so not loaded on pages.";
  return (
    <div className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)_auto] sm:items-center py-3 border-t border-base-300 first:border-t-0" data-font-role={font.id}>
      <div className="min-w-0">
        {font.builtin ? (
          <div className="text-sm font-medium">{font.name}</div>
        ) : (
          <input
            className="input input-sm w-full font-medium"
            aria-label="Font name"
            value={font.name}
            onChange={(e) =>
              set((f) => {
                f.name = e.target.value;
              })
            }
          />
        )}
        <div className="text-xs text-base-content/60 mt-1">{note}</div>
      </div>
      <div className="flex items-center gap-2 min-w-0">
        <button type="button" className="btn btn-outline justify-start flex-1 min-w-0 h-auto py-2 px-3" onClick={() => setOpen(true)} aria-label={`Choose the ${font.name} font`}>
          <span className="flex flex-col items-start gap-0.5 overflow-hidden min-w-0">
            <span className="text-xs text-base-content/50">{font.family || "Browser default"}</span>
            <span className="text-base truncate max-w-full" style={{ fontFamily: fontStack(font) }}>
              Trails, towns, and long lake days
            </span>
          </span>
        </button>
        {font.family && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() =>
              set((f) => {
                Object.assign(f, NO_FONT);
              })
            }
          >
            Use default
          </button>
        )}
      </div>
      <div className="justify-self-end">
        <LockOrDelete builtin={font.builtin} label={font.name} onDelete={() => requestDelete("font", font.id)} />
      </div>
      {open && (
        <FontPickerDialog
          title={`Select the ${font.name.toLowerCase()} font`}
          current={font.family}
          presets={presets}
          onClose={() => setOpen(false)}
          onSelect={(chosen) =>
            set((f) => {
              Object.assign(f, chosen);
            })
          }
        />
      )}
    </div>
  );
}

export function TypographyTab({ theme, update, usageOf, requestDelete, fontPresets }: TabProps & { fontPresets: string[] }) {
  const atLimit = theme.fonts.length >= MAX_FONTS;
  return (
    <>
      <Panel
        title="Fonts"
        description="The site's fonts, from Bunny Fonts. Text styles below pick one of these rather than a family, so changing a font here restyles everything that uses it. Only the weights the theme uses are loaded."
        action={
          atLimit ? undefined : (
            <AddByName
              label="Add font"
              placeholder="e.g. Accent"
              onAdd={(name) =>
                update((t) => {
                  t.fonts.push({ id: uniqueId(name, t.fonts.map((f) => f.id)), name, ...NO_FONT });
                })
              }
            />
          )
        }
      >
        {theme.fonts.length > FONT_SOFT_LIMIT && (
          <p role="status" className="flex items-start gap-1.5 text-sm text-warning mb-3" data-font-limit-warning>
            <TriangleAlert className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
            Each font is another download for every visitor. Most sites read best with two or three.
          </p>
        )}
        <div>
          {theme.fonts.map((font, index) => (
            <FontRow key={font.id} font={font} index={index} theme={theme} update={update} presets={fontPresets} requestDelete={requestDelete} />
          ))}
        </div>
      </Panel>
      <Panel
        title="Text styles"
        description={'Text components offer these as a single "Text style" choice, and rich text can set one on any paragraph or heading. Built-in styles also style rich text\'s own headings and paragraphs. Sizes are in units of 0.25rem.'}
        action={
          <AddByName
            label="Add text style"
            placeholder="e.g. Pull quote"
            onAdd={(name) =>
              update((t) => {
                t.textStyles.push({
                  id: uniqueId(name, takenIds(t, "textStyle", t.textStyles.map((x) => x.id))),
                  name,
                  font: "body",
                  size: 4,
                  weight: 400,
                  lineHeight: 1.5,
                });
              })
            }
          />
        }
      >
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Style</th>
                <th>Font</th>
                <th>Size</th>
                <th>Weight</th>
                <th>Line height</th>
                <th>Sample</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {theme.textStyles.map((style, i) => {
                const set = (change: (s: typeof style) => void) => update((t) => change(t.textStyles[i] as typeof style));
                const font = fontRole(theme, style.font);
                const n = usageOf("textStyle", style.id);
                return (
                  <tr key={style.id} data-text-style={style.id}>
                    <td className="whitespace-nowrap">
                      {style.builtin ? (
                        <div className="font-medium">{style.name}</div>
                      ) : (
                        <input
                          className="input input-sm w-36 font-medium"
                          aria-label="Text style name"
                          value={style.name}
                          onChange={(e) =>
                            set((x) => {
                              x.name = e.target.value;
                            })
                          }
                        />
                      )}
                      <div className="text-xs text-base-content/60">{usageText(n)}</div>
                    </td>
                    <td>
                      <select
                        className="select select-sm w-32"
                        aria-label={`${style.name} font`}
                        value={style.font}
                        onChange={(e) =>
                          set((x) => {
                            x.font = e.target.value;
                          })
                        }
                      >
                        {theme.fonts.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <UnitsInput
                        label={`${style.name} size`}
                        value={style.size}
                        min={1}
                        max={40}
                        onChange={(v) =>
                          set((x) => {
                            x.size = v;
                          })
                        }
                      />
                    </td>
                    <td>
                      <select
                        className="select select-sm w-24"
                        aria-label={`${style.name} weight`}
                        value={style.weight}
                        onChange={(e) =>
                          set((x) => {
                            x.weight = Number(e.target.value);
                          })
                        }
                      >
                        {[...new Set([...weightOptions(font), style.weight])]
                          .sort((a, b) => a - b)
                          .map((w) => (
                            <option key={w} value={w} disabled={!weightOptions(font).includes(w)}>
                              {w}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="number"
                        step={0.05}
                        min={0.8}
                        max={3}
                        className="input input-sm w-20"
                        aria-label={`${style.name} line height`}
                        value={style.lineHeight}
                        onChange={(e) => {
                          const value = Number.parseFloat(e.target.value);
                          if (!Number.isFinite(value)) return;
                          set((x) => {
                            x.lineHeight = value;
                          });
                        }}
                      />
                    </td>
                    <td className="max-w-[220px]">
                      <div
                        className="truncate"
                        style={{ fontFamily: fontStack(font), fontSize: `min(${units(style.size)}, 2.1rem)`, fontWeight: style.weight, lineHeight: style.lineHeight }}
                      >
                        {style.name}
                      </div>
                    </td>
                    <td className="text-right">
                      <LockOrDelete builtin={style.builtin} label={style.name} onDelete={() => requestDelete("textStyle", style.id)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

/* ---------- Buttons ---------- */

const RADIUS_LABEL: Record<RadiusKey, string> = { sm: "SM", md: "MD", lg: "LG", full: "Pill" };

function radiusText(theme: Theme, key: RadiusKey): string {
  return key === "full" ? "round" : `${theme.radii[key]} units`;
}

export function ButtonsTab({ theme, update, mode, usageOf, requestDelete }: TabProps) {
  const radius = radiusCss(theme, theme.buttons.radius);
  return (
    <>
      <Panel title="Button basics" description="Shared by every variant, so changing the corner radius here reshapes every button on the site.">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="text-sm font-medium block mb-1.5" htmlFor="b-radius">
              Corner radius
            </label>
            <select id="b-radius" className="select w-full" value={theme.buttons.radius} onChange={(e) => update((t) => {
              t.buttons.radius = e.target.value as RadiusKey;
            })}>
              {(Object.keys(RADIUS_LABEL) as RadiusKey[]).map((k) => (
                <option key={k} value={k}>
                  {RADIUS_LABEL[k]} ({radiusText(theme, k)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1.5" htmlFor="b-weight">
              Text weight
            </label>
            <select id="b-weight" className="select w-full" value={theme.buttons.weight} onChange={(e) => update((t) => {
              t.buttons.weight = Number(e.target.value);
            })}>
              {weightOptions(fontRole(theme, "body")).map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1.5" htmlFor="b-size">
              Size
            </label>
            <select id="b-size" className="select w-full" value={theme.buttons.size} onChange={(e) => update((t) => {
              t.buttons.size = e.target.value as ButtonSize;
            })}>
              {(Object.keys(BUTTON_SIZES) as ButtonSize[]).map((k) => (
                <option key={k} value={k}>
                  {BUTTON_SIZES[k].label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Panel>
      <Panel
        title="Button variants"
        description={'"Match the section" colors adapt to whatever scheme the button sits in. "Always this color" stays fixed, for buttons like a green Buy now. Hover, pressed and keyboard-focus states are generated from each variant.'}
        action={
          <AddByName
            label="Add variant"
            placeholder="e.g. Buy now"
            onAdd={(name) =>
              update((t) => {
                t.buttons.variants.push({
                  id: uniqueId(name, takenIds(t, "variant", t.buttons.variants.map((v) => v.id))),
                  name,
                  bg: "scheme.btnBg",
                  fg: "scheme.btnFg",
                  border: "none",
                });
              })
            }
          />
        }
      >
        <div className="flex flex-col gap-4">
          {theme.buttons.variants.map((v, i) => {
            const n = usageOf("variant", v.id);
            const set = (change: (variant: typeof v) => void) => update((t) => change(t.buttons.variants[i] as typeof v));
            return (
              <div key={v.id} className="border border-base-300 rounded-lg p-4" data-variant={v.id}>
                <div className="flex items-center gap-2 mb-3">
                  <input className="input input-sm flex-1 font-medium" aria-label="Variant name" value={v.name} onChange={(e) => set((x) => {
                    x.name = e.target.value;
                  })} />
                  <span className="text-xs text-base-content/60 whitespace-nowrap hidden sm:inline">{usageText(n)}</span>
                  <LockOrDelete builtin={v.builtin} label={v.name} onDelete={() => requestDelete("variant", v.id)} />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="text-xs text-base-content/60 block mb-1" htmlFor={`v-${v.id}-bg`}>
                      Background
                    </label>
                    <RefSelect id={`v-${v.id}-bg`} theme={theme} label="Background" value={v.bg} none={{ value: "transparent", label: "None" }} onChange={(ref) => set((x) => {
                      x.bg = ref;
                    })} />
                  </div>
                  <div>
                    <label className="text-xs text-base-content/60 block mb-1" htmlFor={`v-${v.id}-fg`}>
                      Text
                    </label>
                    <RefSelect id={`v-${v.id}-fg`} theme={theme} label="Text" value={v.fg} onChange={(ref) => set((x) => {
                      x.fg = ref;
                    })} />
                  </div>
                  <div>
                    <label className="text-xs text-base-content/60 block mb-1" htmlFor={`v-${v.id}-bd`}>
                      Outline
                    </label>
                    <RefSelect id={`v-${v.id}-bd`} theme={theme} label="Outline" value={v.border} none={{ value: "none", label: "None" }} onChange={(ref) => set((x) => {
                      x.border = ref;
                    })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                  {theme.schemes.map((s) => (
                    <div key={s.id} className="rounded-md p-2.5 flex items-center justify-center" style={{ background: schemeFill(theme, s, mode) }} title={s.name}>
                      <span
                        className="text-xs font-semibold px-2.5 py-1"
                        style={{
                          borderRadius: radius,
                          background: refHex(theme, v.bg, s, mode) ?? "transparent",
                          color: refHex(theme, v.fg, s, mode),
                          border: `1.5px solid ${refHex(theme, v.border, s, mode) ?? "transparent"}`,
                        }}
                      >
                        {v.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </>
  );
}

/* ---------- Borders and cards ---------- */

export function SurfacesTab({ theme, update, mode, usageOf, requestDelete }: TabProps) {
  const s0 = theme.schemes[0] as ThemeScheme;
  const c = theme.card;
  return (
    <>
      <Panel title="Corner radius scale" description="Buttons and cards pick from these sizes, so the whole site can go from sharp to soft in one edit. Sizes are in units of 0.25rem.">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {(["sm", "md", "lg", "full"] as const).map((k) => (
            <div key={k} className="flex items-center gap-3">
              <div
                className="w-10 h-10 border-2 border-base-content/40 shrink-0"
                style={{ borderRadius: k === "full" ? "9999px" : `min(${units(theme.radii[k])}, 1.25rem)` }}
                aria-hidden="true"
              />
              <div>
                <div className="text-sm font-medium">{RADIUS_LABEL[k]}</div>
                {k === "full" ? (
                  <div className="text-xs text-base-content/60">Fully round</div>
                ) : (
                  <UnitsInput label={`${RADIUS_LABEL[k]} radius`} className="w-24 mt-1" value={theme.radii[k]} onChange={(v) => update((t) => {
                    t.radii[k] = v;
                  })} />
                )}
              </div>
            </div>
          ))}
        </div>
      </Panel>
      <Panel
        title="Border presets"
        description={'Editors never set widths or colors on a border. Cards and sections pick one of these presets and the sides it goes on, and "Match the section" borders recolor with the scheme. Widths are in pixels so hairlines stay crisp.'}
        action={
          <AddByName
            label="Add preset"
            placeholder="e.g. Accent"
            onAdd={(name) =>
              update((t) => {
                // "none" is how components store no border, so it's never a preset id.
                t.borders.push({ id: uniqueId(name, [NO_BORDER, ...takenIds(t, "border", t.borders.map((b) => b.id))]), name, width: 1, color: "scheme.border" });
              })
            }
          />
        }
      >
        <div>
          {theme.borders.map((b, i) => {
            const n = usageOf("border", b.id);
            const set = (change: (border: typeof b) => void) => update((t) => change(t.borders[i] as typeof b));
            return (
              <div key={b.id} className={`flex flex-wrap items-center gap-3 py-3 ${i ? "border-t border-base-300" : ""}`} data-border={b.id}>
                <div
                  className="w-12 h-9 rounded-md shrink-0"
                  style={{ background: colorHex(theme, s0.roles.bg, mode), border: `${b.width}px solid ${refHex(theme, b.color, s0, mode)}` }}
                  aria-hidden="true"
                />
                <input className="input input-sm w-32 font-medium" aria-label="Border name" value={b.name} onChange={(e) => set((x) => {
                  x.name = e.target.value;
                })} />
                <select className="select select-sm w-24" aria-label={`${b.name} width in pixels`} value={b.width} onChange={(e) => set((x) => {
                  x.width = Number(e.target.value);
                })}>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((w) => (
                    <option key={w} value={w}>
                      {w}px
                    </option>
                  ))}
                </select>
                <div className="flex-1 min-w-40">
                  <RefSelect theme={theme} label={`${b.name} color`} value={b.color} onChange={(ref) => set((x) => {
                    x.color = ref;
                  })} />
                </div>
                <span className="text-xs text-base-content/60 whitespace-nowrap hidden sm:inline">{usageText(n)}</span>
                <LockOrDelete builtin={b.builtin} label={b.name} onDelete={() => requestDelete("border", b.id)} />
              </div>
            );
          })}
        </div>
      </Panel>
      <Panel
        title="Cards"
        description="How every Card looks, including Card Collection items set to Card. Editors still choose each card's scheme on the page, and can give a card a border of its own."
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="text-sm font-medium block mb-1.5" htmlFor="card-border">
              Border
            </label>
            <select id="card-border" className="select w-full" value={c.border} onChange={(e) => update((t) => {
              t.card.border = e.target.value;
            })}>
              <option value="none">None</option>
              {theme.borders.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1.5" htmlFor="card-radius">
              Corner radius
            </label>
            <select id="card-radius" className="select w-full" value={c.radius} onChange={(e) => update((t) => {
              t.card.radius = e.target.value as Theme["card"]["radius"];
            })}>
              {(["sm", "md", "lg"] as const).map((k) => (
                <option key={k} value={k}>
                  {RADIUS_LABEL[k]} ({radiusText(theme, k)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1.5" htmlFor="card-shadow">
              Shadow
            </label>
            <select id="card-shadow" className="select w-full" value={c.shadow} onChange={(e) => update((t) => {
              t.card.shadow = e.target.value as CardShadow;
            })}>
              {(Object.keys(CARD_SHADOWS) as CardShadow[]).map((k) => (
                <option key={k} value={k}>
                  {CARD_SHADOWS[k].label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1.5" htmlFor="card-padding">
              Inner spacing
            </label>
            <select id="card-padding" className="select w-full" value={c.padding} onChange={(e) => update((t) => {
              t.card.padding = e.target.value as CardPadding;
            })}>
              {(Object.keys(CARD_PADDINGS) as CardPadding[]).map((k) => (
                <option key={k} value={k}>
                  {CARD_PADDINGS[k].label} ({CARD_PADDINGS[k].padding} units)
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-4" data-card-sides>
          <div className="text-sm font-medium mb-1.5">Border sides</div>
          <SidesPicker
            value={c.sides}
            readOnly={c.border === NO_BORDER}
            label="Card border sides"
            onChange={(sides) => update((t) => {
              t.card.sides = sides;
            })}
          />
        </div>
      </Panel>
    </>
  );
}
