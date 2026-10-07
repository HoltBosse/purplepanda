import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_SAMPLE_TEXT,
  ensureStylesheet,
  type Font,
  type FontEntry,
  fontEntries,
  loadFontList,
  MAX_VISIBLE_ROWS,
  matchesQuery,
  observeRows,
  presetFonts,
  showRowPreview,
} from "../../form/fields/font-picker-core.js";
import type { ThemeFont } from "../../theme/index.js";

// The Bunny font picker as a React dialog, for the theme screen. Shares its list loading, search
// and lazy previews with the FontPicker form field (see form/fields/font-picker-core.ts). A chosen
// font comes back with its category and available weights; the link's weights are rebuilt for
// what the theme uses when it's saved.

export function FontPickerDialog({
  title,
  current,
  presets,
  onSelect,
  onClose,
}: {
  title: string;
  current: string;
  presets: string[];
  onSelect: (font: ThemeFont) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [fonts, setFonts] = useState<Font[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [query, setQuery] = useState("");

  useEffect(() => {
    dialogRef.current?.showModal();
    let live = true;
    loadFontList()
      .then((list) => {
        if (!live) return;
        setFonts(list);
        setStatus("ready");
      })
      .catch(() => live && setStatus("error"));
    return () => {
      live = false;
    };
  }, []);

  const entries = useMemo(
    () => fontEntries(presetFonts(presets), fonts).filter((e) => matchesQuery(e.family, query)),
    [fonts, presets, query],
  );
  const visible = entries.slice(0, MAX_VISIBLE_ROWS);

  // Each row's stylesheet loads only as it scrolls near view. Rerun whenever the rendered rows change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `visible` is what decides which rows exist to observe
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const observer = observeRows(list, showRowPreview);
    for (const row of list.querySelectorAll<HTMLElement>("[data-href]")) observer.observe(row);
    return () => observer.disconnect();
  }, [visible]);

  const choose = (entry: FontEntry) => {
    ensureStylesheet(entry.href);
    onSelect({ family: entry.family, link: entry.href, category: entry.category, weights: entry.weights });
    dialogRef.current?.close();
  };

  return (
    <dialog ref={dialogRef} className="modal" onClose={onClose}>
      <div className="modal-box max-w-2xl">
        <button type="button" className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" aria-label="Close" onClick={() => dialogRef.current?.close()}>
          ✕
        </button>
        <h3 className="text-lg font-semibold mb-4">{title}</h3>
        <input
          type="text"
          placeholder="Search fonts..."
          aria-label="Search fonts"
          className="input w-full mb-4"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div ref={listRef} className="max-h-96 overflow-y-auto space-y-1 pr-1" data-font-list>
          {status === "error" && presets.length === 0 ? (
            <p className="text-sm text-error p-4">Failed to load fonts. Please try again.</p>
          ) : visible.length === 0 ? (
            <p className="text-sm text-base-content/50 p-4">{status === "loading" ? "Loading fonts…" : "No fonts match your search."}</p>
          ) : (
            visible.map((entry) => (
              <button
                key={`${entry.isPreset ? "preset" : "bunny"}:${entry.family}`}
                type="button"
                data-href={entry.href}
                data-family={entry.family}
                onClick={() => choose(entry)}
                className={`w-full text-left px-4 py-3 rounded-lg hover:bg-base-200 flex flex-col gap-1 border ${
                  entry.family === current ? "border-primary bg-base-200" : "border-transparent"
                }`}
              >
                <span className="text-xs text-base-content/50">
                  {entry.isPreset ? `${entry.family} · Site font` : `${entry.family} · ${entry.category}`}
                </span>
                <span className="text-lg truncate" data-row-sample>
                  {DEFAULT_SAMPLE_TEXT}
                </span>
              </button>
            ))
          )}
          {entries.length > visible.length && (
            <p className="text-xs text-base-content/40 p-2 text-center">
              Showing {visible.length} of {entries.length} matching fonts. Refine your search to narrow results.
            </p>
          )}
        </div>
      </div>
      <form method="dialog" className="modal-backdrop">
        <button type="submit">close</button>
      </form>
    </dialog>
  );
}
