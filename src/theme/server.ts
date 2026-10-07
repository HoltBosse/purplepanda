import { and, eq, gt, like, or } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { getSetting, invalidateSettingsCache } from "../db/content-cache.js";
import { NOT_FOUND_SETTING_KEY } from "../db/not-found.js";
import { CONTENT_PREFAB_SETTING_KEY_PREFIX, DEFAULT_PREFAB_SETTING_KEY } from "../db/prefabs.js";
import { dagNodes, forms, pages, settings, templates } from "../db/schema.js";
import { addPublishNode, upsertSetting } from "../db/settings.js";
import { themeFontLinks, themeToCss } from "./css.js";
import { fontFromLegacyLink } from "./fonts.js";
import { normalizeTheme } from "./normalize.js";
import { DEFAULT_THEME } from "./presets.js";
import type { Theme } from "./types.js";
import { countUsage, type ThemeUsage } from "./usage.js";

// The site theme is one `settings` row (key `theme`), read through the settings cache so a save
// reaches every worker via its LISTEN/NOTIFY invalidation. Each save also adds a history node to
// dag_nodes (entityType `theme`, entityId the settings row's id), the way prefab saves do.

type Db = NodePgDatabase<Record<string, unknown>>;

export const THEME_SETTING_KEY = "theme";
export const THEME_ENTITY_TYPE = "theme";

// What a site without a theme row renders: the default preset, with the fonts from the settings
// the theme replaced (`heading_font_link`, `body_font_link`) for sites that set them before themes
// existed. Read until the site's theme is first saved.
async function fallbackTheme(db: Db): Promise<Theme> {
  const [heading, body] = await Promise.all([getSetting(db, "heading_font_link"), getSetting(db, "body_font_link")]);
  const headingFont = fontFromLegacyLink(heading);
  const bodyFont = fontFromLegacyLink(body);
  if (!headingFont && !bodyFont) return DEFAULT_THEME;
  return {
    ...DEFAULT_THEME,
    fonts: DEFAULT_THEME.fonts.map((role) => {
      const legacy = role.id === "heading" ? headingFont : role.id === "body" ? bodyFont : undefined;
      return legacy ? { ...role, ...legacy } : role;
    }),
  };
}

type Rendered = { theme: Theme; css: string; fontLinks: string[] };

// Keyed on the cached stored value itself, so a save (which replaces it in the settings cache)
// is all it takes to rebuild.
const renderedByStored = new WeakMap<object, Rendered>();

function render(theme: Theme): Rendered {
  return { theme, css: themeToCss(theme), fontLinks: themeFontLinks(theme) };
}

// The site theme, its CSS and its font stylesheets.
export async function getRenderedTheme(db: Db): Promise<Rendered> {
  const stored = await getSetting(db, THEME_SETTING_KEY);
  if (typeof stored !== "object" || stored === null) return render(normalizeTheme(undefined, await fallbackTheme(db)));
  let rendered = renderedByStored.get(stored);
  if (!rendered) {
    rendered = render(normalizeTheme(stored, DEFAULT_THEME));
    renderedByStored.set(stored, rendered);
  }
  return rendered;
}

export async function getTheme(db: Db): Promise<Theme> {
  return (await getRenderedTheme(db)).theme;
}

// Saves `theme` as the site's theme, live at once, and returns the settings row id and the new
// history node's id.
export async function saveTheme(db: Db, theme: Theme): Promise<{ rowId: string; versionId: string | undefined }> {
  const row = await upsertSetting(db, THEME_SETTING_KEY, theme);
  if (!row) throw new Error("Could not save the theme");
  const node = await addPublishNode(db, THEME_ENTITY_TYPE, row.id, theme);
  invalidateSettingsCache(db);
  return { rowId: row.id, versionId: node?.id };
}

// Counts every live document that references each scheme, variant and text style: pages and
// content items, templates, forms, prefabs, the custom 404 page, and open drafts of any of them.
export async function getThemeUsage(db: Db): Promise<ThemeUsage> {
  const [pageRows, templateRows, formRows, settingRows, draftRows] = await Promise.all([
    db.select({ content: pages.content }).from(pages).where(gt(pages.state, -1)),
    db.select({ content: templates.content }).from(templates).where(gt(templates.state, -1)),
    db.select({ content: forms.content }).from(forms).where(gt(forms.state, -1)),
    db
      .select({ content: settings.value })
      .from(settings)
      .where(
        or(
          eq(settings.key, DEFAULT_PREFAB_SETTING_KEY),
          like(settings.key, `${CONTENT_PREFAB_SETTING_KEY_PREFIX}%`),
          eq(settings.key, NOT_FOUND_SETTING_KEY),
        ),
      ),
    db
      .select({ content: dagNodes.content })
      .from(dagNodes)
      .where(and(eq(dagNodes.nodeType, "draft"), eq(dagNodes.state, 1))),
  ]);
  return countUsage([...pageRows, ...templateRows, ...formRows, ...settingRows, ...draftRows].map((r) => r.content));
}
