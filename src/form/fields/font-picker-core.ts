import { BUNNY_FONT_LIST_URL, type BunnyFont, buildFontLink, extractFamilyFromLink, pickDefaultWeights } from "./font-utils";

// The browser side of the Bunny font pickers, shared by the form field (FontPicker.astro) and the
// theme screen's React picker: the font list (fetched once per page), stylesheet loading for
// previews, and search.

export type Font = BunnyFont & { slug: string };

// Rows rendered at once; a search narrows the rest.
export const MAX_VISIBLE_ROWS = 500;

let fontListPromise: Promise<Font[]> | null = null;

export function loadFontList(): Promise<Font[]> {
  if (!fontListPromise) {
    fontListPromise = fetch(BUNNY_FONT_LIST_URL)
      .then((res) => res.json())
      .then((data: Record<string, BunnyFont>) =>
        Object.entries(data)
          .map(([slug, font]) => ({ ...font, slug }))
          .sort((a, b) => a.familyName.localeCompare(b.familyName)),
      )
      .catch((error: unknown) => {
        // Let the next attempt try again rather than keep a failed fetch forever.
        fontListPromise = null;
        throw error;
      });
  }
  return fontListPromise;
}

// Adds a stylesheet link to `doc` unless it already has one for `href`. Checked against the
// document itself, so each document (the page, an editor iframe) gets its own copy.
export function ensureStylesheet(href: string, doc: Document = document): void {
  if (doc.head.querySelector(`link[href="${CSS.escape(href)}"]`)) return;
  const link = doc.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  doc.head.appendChild(link);
}

export function matchesQuery(family: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || family.toLowerCase().includes(q);
}

// Loads each row's preview stylesheet only once the row scrolls near view, so opening a list of
// ~1,800 families doesn't fetch ~1,800 stylesheets. `onVisible` gets each row as it comes in.
export function observeRows(root: HTMLElement, onVisible: (row: HTMLElement) => void): IntersectionObserver {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        onVisible(entry.target as HTMLElement);
      }
    },
    { root, rootMargin: "200px" },
  );
  return observer;
}

export const DEFAULT_SAMPLE_TEXT = "The quick brown fox jumps over the lazy dog";

export type PresetFont = { family: string; href: string };

export type FontEntry = { family: string; href: string; category: string; weights: number[]; isPreset: boolean };

// The install's own font stylesheets (puck.config's fontFamilies), offered ahead of Bunny's list.
export function presetFonts(hrefs: string[]): PresetFont[] {
  return hrefs.flatMap((href) => {
    const family = extractFamilyFromLink(href);
    return family ? [{ href, family }] : [];
  });
}

// The picker's rows: the presets, then every Bunny family the presets don't already cover.
export function fontEntries(presets: PresetFont[], fonts: Font[]): FontEntry[] {
  const presetFamilies = new Set(presets.map((p) => p.family.toLowerCase()));
  const bunny: FontEntry[] = fonts
    .filter((f) => !presetFamilies.has(f.familyName.toLowerCase()))
    .map((f) => ({
      family: f.familyName,
      href: buildFontLink(f.familyName, pickDefaultWeights(f.weights)),
      category: f.category,
      weights: f.weights,
      isPreset: false,
    }));
  return [...presets.map((p) => ({ family: p.family, href: p.href, category: "", weights: [], isPreset: true })), ...bunny];
}

// The observeRows callback for a picker row: loads its stylesheet and shows its sample in the font.
export function showRowPreview(row: HTMLElement): void {
  ensureStylesheet(row.dataset.href as string);
  const sample = row.querySelector<HTMLElement>("[data-row-sample]");
  if (sample) sample.style.fontFamily = `'${row.dataset.family}'`;
}
