import type { APIContext } from "astro";
import { addAlertToSession, alertType, createAlert } from "../../../../alert/index.js";
import { addAction } from "../../../../audit/index.js";
import { requireSuperAdmin } from "../../../../auth/super-admin.js";
import { getDb } from "../../../../db/db.js";
import { settings } from "../../../../db/schema.js";
import { normalizeTheme, withRebuiltFontLinks } from "../../../../theme/index.js";
import { getTheme, saveTheme } from "../../../../theme/server.js";

const THEME_PATH = "/admin/settings/themes";

// Saves the theme screen's working copy as the site theme, live at once. Posted as a form (a
// `theme` JSON field) like the editors' saves, so the result comes back as a flash alert on the
// redirect.
export async function POST(context: APIContext): Promise<Response> {
  const access = await requireSuperAdmin(context);
  if (access.response) return access.response;

  const db = getDb();
  const formData = await context.request.formData();
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(formData.get("theme") ?? ""));
  } catch {
    parsed = undefined;
  }
  if (typeof parsed !== "object" || parsed === null) {
    await addAlertToSession(context.session, createAlert(alertType.error, "Invalid theme submitted."));
    return context.redirect(THEME_PATH);
  }

  // Normalized against the current theme, so anything invalid falls back to what's live rather
  // than to the default preset. The font links are rebuilt for the weights the theme now uses.
  const theme = withRebuiltFontLinks(normalizeTheme(parsed, await getTheme(db)));

  const { rowId, versionId } = await saveTheme(db, theme);
  await addAction("theme:update", { id: rowId, version: versionId ?? null }, access.user.id, {
    message: "The site theme was updated",
    placeholders: {
      id: { lookupColumn: settings.id, displayColumn: settings.key },
    },
  });
  await addAlertToSession(context.session, createAlert(alertType.success, "Theme saved. Every page using it is updated."));
  return context.redirect(`${THEME_PATH}?saved=1`);
}
