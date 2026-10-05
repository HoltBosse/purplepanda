import { inArray } from "drizzle-orm";
import { getSetting } from "../db/content-cache.js";
import { getDb } from "../db/db.js";
import { settings as settingsTable } from "../db/schema.js";
import {
  type ComponentSettingValues,
  type ComponentSiteSettings,
  type ComponentWithSiteSettings,
  componentSettingsKey,
  normalizeComponentSettings,
  type PublicComponentSettingValues,
  publicComponentSettings,
} from "./component-settings.js";

// A component's site settings for the current request's site, secrets included — for server code
// only (data resolvers, submission checks). Read through the settings cache, which the settings
// page invalidates when it saves.
export async function getComponentSettings<TSettings extends ComponentSiteSettings>(
  componentName: string,
  settings: TSettings,
): Promise<ComponentSettingValues<TSettings>> {
  return normalizeComponentSettings(settings, await getSetting(getDb(), componentSettingsKey(componentName)));
}

// The same without the secret fields — what a data resolver may pass on to a render.
export async function getPublicComponentSettings<TSettings extends ComponentSiteSettings>(
  componentName: string,
  settings: TSettings,
): Promise<PublicComponentSettingValues<TSettings>> {
  return publicComponentSettings(settings, await getComponentSettings(componentName, settings));
}

// Every listed component's stored settings, read straight from the database (not the cache) for
// the settings page and its save handler.
export async function getStoredComponentSettings(
  components: ComponentWithSiteSettings[],
): Promise<Map<string, ComponentSettingValues>> {
  const keys = components.map((component) => componentSettingsKey(component.name));
  const rows = keys.length > 0
    ? await getDb().select().from(settingsTable).where(inArray(settingsTable.key, keys))
    : [];
  const byKey = new Map(rows.map((row) => [row.key, row.value]));
  return new Map(
    components.map((component) => [
      component.name,
      normalizeComponentSettings(component.settings, byKey.get(componentSettingsKey(component.name))),
    ]),
  );
}
