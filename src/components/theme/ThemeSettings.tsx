import { useCallback, useEffect, useRef, useState } from "react";
import { loadFontList } from "../../form/fields/font-picker-core.js";
import { MousePointerClick, Palette, SquareDashed, SwatchBook, Type } from "../../puck/icons.js";
import { capitalize } from "../../string/index.js";
import {
  colorUsage,
  deleteColor,
  deleteFont,
  deleteWithReplacement,
  followReplaced,
  fontUsage,
  liveIds,
  type Mode,
  normalizeTheme,
  REPLACEABLE_KINDS,
  REPLACEMENT_DEFAULTS,
  type ReplaceableKind,
  THEME_CHANNEL,
  THEME_PRESETS,
  type Theme,
  type ThemeUsage,
  themeSummary,
} from "../../theme/index.js";
import { postForm } from "../post-form.js";
import { pluralize } from "./editor-ui.js";
import { ThemePreview } from "./ThemePreview.js";
import { ButtonsTab, ColorsTab, type DeletableKind, SchemesTab, SurfacesTab, type TabProps, TypographyTab } from "./tabs.js";

// /admin/settings/themes: edits the site theme. Works on a local copy of the saved theme, shows it
// in a live preview built from the real components, and saves it (live at once) through an
// ordinary form post (see pages/admin/settings/themes/save.ts).

export type ThemeSettingsProps = {
  // The site's theme as it is now.
  saved: Theme;
  usage: ThemeUsage;
  // The install's own font stylesheets, offered first in the font pickers.
  fontPresets: string[];
  // Set after a save redirect: tells open editors in other tabs to restyle.
  justSaved?: boolean;
};

const TABS = [
  { id: "colors", label: "Colors", icon: Palette },
  { id: "schemes", label: "Schemes", icon: SwatchBook },
  { id: "type", label: "Typography", icon: Type },
  { id: "buttons", label: "Buttons", icon: MousePointerClick },
  { id: "surfaces", label: "Borders and cards", icon: SquareDashed },
] as const;
type TabId = (typeof TABS)[number]["id"];

type PendingDelete = { kind: DeletableKind; id: string; count: number };

const same = (a: Theme, b: Theme) => JSON.stringify(a) === JSON.stringify(b);

// What the delete dialog says about each kind of item, and where the theme keeps them.
const KINDS: Record<DeletableKind, { noun: string; items: (t: Theme) => { id: string; name: string }[] }> = {
  color: { noun: "color", items: (t) => t.colors },
  font: { noun: "font", items: (t) => t.fonts },
  scheme: { noun: "scheme", items: (t) => t.schemes },
  variant: { noun: "button variant", items: (t) => t.buttons.variants },
  textStyle: { noun: "text style", items: (t) => t.textStyles },
  border: { noun: "border preset", items: (t) => t.borders },
};

// Switching to a preset keeps the content that uses this theme's schemes, variants, text styles and borders working:
// any id the preset lacks is tombstoned onto its default.
export function applyPreset(current: Theme, preset: Theme): Theme {
  const next = structuredClone(preset);
  next.replaced = { ...current.replaced, ...next.replaced };
  for (const kind of REPLACEABLE_KINDS) {
    const kept = liveIds(next, kind);
    for (const id of liveIds(current, kind)) if (!kept.has(id)) next.replaced[`${kind}:${id}`] = REPLACEMENT_DEFAULTS[kind];
  }
  return normalizeTheme(next, preset);
}

export default function ThemeSettings({ saved, usage: initialUsage, fontPresets, justSaved }: ThemeSettingsProps) {
  const [theme, setTheme] = useState<Theme>(() => structuredClone(saved));
  // What "Discard changes" goes back to: the saved theme, plus any font details filled in below.
  const [baseline, setBaseline] = useState<Theme>(saved);
  const [usage, setUsage] = useState(initialUsage);
  const [tab, setTab] = useState<TabId>("colors");
  const [mode, setMode] = useState<Mode>("light");
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const [replacement, setReplacement] = useState("");
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const deleteDialog = useRef<HTMLDialogElement>(null);

  const dirty = !same(theme, baseline);
  const unsaved = !same(theme, saved);

  const update = useCallback((change: (working: Theme) => void) => {
    setTheme((current) => {
      const next = structuredClone(current);
      change(next);
      return next;
    });
  }, []);

  const notify = useCallback((message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  // Tell open editors about the theme that was just saved, then drop the flag from the URL.
  useEffect(() => {
    if (!justSaved) return;
    if (typeof BroadcastChannel !== "undefined") {
      const channel = new BroadcastChannel(THEME_CHANNEL);
      channel.postMessage(themeSummary(saved));
      channel.close();
    }
    const url = new URL(window.location.href);
    url.searchParams.delete("saved");
    window.history.replaceState(null, "", url);
  }, [justSaved, saved]);

  // Sites whose fonts came over from the old font settings don't know their Bunny category or
  // weights yet. Fill them in from Bunny's list, quietly: it's metadata, not an edit, and the
  // next save keeps it. Only on first load: later font changes come from the picker with theirs.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once, against the loaded theme
  useEffect(() => {
    if (!theme.fonts.some((f) => f.family && !f.category)) return;
    loadFontList()
      .then((list) => {
        const fill = (t: Theme) => {
          const next = structuredClone(t);
          for (const font of next.fonts) {
            if (!font.family || font.category) continue;
            const match = list.find((f) => f.familyName === font.family);
            if (match) Object.assign(font, { category: match.category, weights: match.weights });
          }
          return next;
        };
        setTheme(fill);
        setBaseline(fill);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!dirty || submitting) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, submitting]);

  // Documents using an item: its own id plus any deleted ids that now resolve to it.
  const countUses = useCallback(
    (counts: ThemeUsage, kind: ReplaceableKind, id: string) => {
      const live = liveIds(theme, kind);
      return Object.entries(counts[kind]).reduce((n, [usedId, count]) => {
        const resolved = live.has(usedId) ? usedId : followReplaced(theme.replaced, kind, usedId, live);
        return resolved === id ? n + count : n;
      }, 0);
    },
    [theme],
  );
  const usageOf = useCallback((kind: ReplaceableKind, id: string) => countUses(usage, kind, id), [countUses, usage]);

  const requestDelete = useCallback(
    async (kind: DeletableKind, id: string) => {
      // Colors and fonts are only used inside the theme, so their references are rewritten in place.
      if (kind === "color" || kind === "font") {
        const count = kind === "color" ? colorUsage(theme, id) : fontUsage(theme, id);
        if (count === 0) {
          setTheme((t) => (kind === "color" ? deleteColor(t, id, "") : deleteFont(t, id, "body")));
          return;
        }
        setReplacement(kind === "font" ? "body" : (theme.colors.find((c) => c.id !== id)?.id ?? ""));
        setPending({ kind, id, count });
        deleteDialog.current?.showModal();
        return;
      }
      // Counts can have moved on since the page loaded, so ask again before deciding.
      let fresh = usage;
      try {
        const res = await fetch("/admin/settings/themes/usage", { credentials: "same-origin" });
        if (res.ok) {
          fresh = (await res.json()) as ThemeUsage;
          setUsage(fresh);
        }
      } catch {
        // Fall back to the counts from page load.
      }
      const count = countUses(fresh, kind, id);
      const fallback = REPLACEMENT_DEFAULTS[kind];
      if (count === 0) {
        setTheme((t) => deleteWithReplacement(t, kind, id, fallback));
        notify(`${capitalize(KINDS[kind].noun)} deleted.`);
        return;
      }
      setReplacement(fallback);
      setPending({ kind, id, count });
      deleteDialog.current?.showModal();
    },
    [theme, usage, countUses, notify],
  );

  const confirmDelete = () => {
    if (!pending || !replacement) return;
    const { kind, id, count } = pending;
    const replacementName = KINDS[kind].items(theme).find((x) => x.id === replacement)?.name;
    if (kind === "color" || kind === "font") {
      setTheme((t) => (kind === "color" ? deleteColor(t, id, replacement) : deleteFont(t, id, replacement)));
      notify(`${capitalize(KINDS[kind].noun)} deleted. Its uses now point to ${replacementName}.`);
    } else {
      setTheme((t) => deleteWithReplacement(t, kind, id, replacement));
      notify(`${capitalize(KINDS[kind].noun)} deleted. ${pluralize(count, "document")} now show${count === 1 ? "s" : ""} ${replacementName}.`);
    }
    deleteDialog.current?.close();
    setPending(null);
  };

  const save = () => {
    setSubmitting(true);
    postForm("/admin/settings/themes/save", { theme: JSON.stringify(theme) });
  };

  const discard = () => {
    setTheme(structuredClone(baseline));
    notify("Changes discarded.");
  };

  const tabProps: TabProps = { theme, update, mode, usageOf, requestDelete, notify };

  const pendingItem = pending && KINDS[pending.kind].items(theme).find((x) => x.id === pending.id);
  const replacementOptions = pending ? KINDS[pending.kind].items(theme).filter((x) => x.id !== pending.id) : [];

  return (
    <section className="max-w-7xl mx-auto pb-4" data-theme-settings>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-base-300 pt-2 pb-3 sticky top-0 z-20 bg-base-200">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold">Theme</h1>
            <span data-theme-status>
              {dirty ? (
                <span className="badge badge-warning badge-soft">Unsaved changes</span>
              ) : unsaved ? (
                // E.g. fonts carried over from the old font settings, now with their Bunny details.
                <span className="badge badge-info badge-soft">Not saved yet</span>
              ) : (
                <span className="badge badge-ghost">Saved</span>
              )}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="select select-sm w-40"
            aria-label="Start from a preset"
            value=""
            onChange={(e) => {
              const preset = THEME_PRESETS.find((p) => p.id === e.target.value);
              if (!preset) return;
              if (!window.confirm(`Replace your working copy with the ${preset.name} preset? Nothing changes on the site until you save.`)) return;
              setTheme((t) => applyPreset(t, preset.theme));
              notify(`${preset.name} preset applied. Review it, then save.`);
            }}
          >
            <option value="">Start from preset…</option>
            {THEME_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {dirty && (
            <button type="button" className="btn btn-ghost" onClick={discard} disabled={submitting}>
              Discard changes
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={save} disabled={!unsaved || submitting}>
            Save
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px] mt-4">
        <div className="min-w-0">
          <div role="tablist" className="tabs tabs-border mb-4 overflow-x-auto flex-nowrap">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                className={`tab gap-2 whitespace-nowrap ${tab === id ? "tab-active" : ""}`}
                onClick={() => setTab(id)}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
          <div role="tabpanel">
            {tab === "colors" && <ColorsTab {...tabProps} />}
            {tab === "schemes" && <SchemesTab {...tabProps} />}
            {tab === "type" && <TypographyTab {...tabProps} fontPresets={fontPresets} />}
            {tab === "buttons" && <ButtonsTab {...tabProps} />}
            {tab === "surfaces" && <SurfacesTab {...tabProps} />}
          </div>
        </div>

        <aside className="lg:sticky lg:top-24 self-start min-w-0">
          <div className="bg-base-100 rounded-lg overflow-hidden border border-base-300">
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-base-300">
              <h2 className="font-medium">Preview</h2>
              <div className="flex items-center gap-2">
                <div className="join">
                  {(["light", "dark"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`btn btn-xs join-item ${mode === m ? "btn-active btn-neutral" : ""}`}
                      aria-pressed={mode === m}
                      onClick={() => setMode(m)}
                    >
                      {m === "light" ? "Light" : "Dark"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="lg:max-h-[calc(100vh-190px)] overflow-auto" data-theme-preview-pane>
              <ThemePreview theme={theme} mode={mode} />
            </div>
          </div>
          <p className="text-xs text-base-content/60 mt-3 px-1">
            The preview uses the site's real components. Its light/dark switch is separate from your admin theme; visitors see dark values when their device is in dark mode.
          </p>
        </aside>
      </div>

      <dialog ref={deleteDialog} className="modal" onClose={() => setPending(null)}>
        <div className="modal-box">
          <h3 className="text-lg font-semibold">
            {pending?.kind === "color" ? `Delete ${pendingItem?.name}?` : pending ? `Delete the ${pendingItem?.name} ${KINDS[pending.kind].noun}?` : ""}
          </h3>
          <p className="py-3 text-sm text-base-content/70">
            {pending?.kind === "color"
              ? `${pendingItem?.name} is used in ${pluralize(pending.count, "place")} across your schemes, buttons, borders, and gradients. Choose a color to use there instead.`
              : pending?.kind === "font"
                ? `${pluralize(pending.count, "text style")} use ${pendingItem?.name}. Choose a font for them instead.`
                : pending
                  ? `${pluralize(pending.count, "document")} use ${pendingItem?.name}. They keep working: once you save, they show the ${KINDS[pending.kind].noun} you choose here.`
                  : ""}
          </p>
          <label className="text-sm font-medium block mb-1" htmlFor="theme-delete-replacement">
            Replace with
          </label>
          <select id="theme-delete-replacement" className="select w-full" value={replacement} onChange={(e) => setReplacement(e.target.value)}>
            {replacementOptions.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          <div className="modal-action">
            <button type="button" className="btn btn-ghost" onClick={() => deleteDialog.current?.close()}>
              Cancel
            </button>
            <button type="button" className="btn btn-error" onClick={confirmDelete}>
              Delete and replace
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button type="submit">close</button>
        </form>
      </dialog>

      <div className="toast toast-end z-50">
        {toasts.map((t) => (
          <div key={t.id} role="status" className="alert alert-success alert-soft text-sm">
            {t.message}
          </div>
        ))}
      </div>
    </section>
  );
}
