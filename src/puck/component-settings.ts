import type { Config } from "@puckeditor/core";

// Site-wide settings a component declares for itself, set once per site under Admin → Settings
// rather than on every block — API keys, a provider's options, a site's privacy choices. A
// component lists them in `siteSettings` (see ./index.ts); the settings page draws a section for
// each such component the site can use, and stores the values as one JSON object in the
// `settings` table under `component:<name>`.
//
// Values are read back through ./component-settings.server.ts, always normalized against the
// declaration below — so a component can change its fields without a migration: a new field reads
// as its default, a removed one is ignored, and an invalid stored value falls back to the default.

type FieldBase = {
  label: string;
  description?: string;
};

export type ComponentSettingField = FieldBase &
  (
    | {
        type: "text";
        placeholder?: string;
        // Also what an empty value reads as, so a field with a default can't be blanked.
        default?: string;
        pattern?: RegExp;
        patternMessage?: string;
      }
    | {
        // Write-only: never sent back to the settings form, the editor or the browser. The form
        // keeps the saved value when the field is left blank and offers a "remove" checkbox.
        type: "secret";
        placeholder?: string;
      }
    | {
        type: "select";
        options: readonly { label: string; value: string }[];
        default: string;
      }
    | {
        type: "boolean";
        default: boolean;
      }
  );

export type ComponentSiteSettings<TFields extends Record<string, ComponentSettingField> = Record<string, ComponentSettingField>> = {
  // The settings section's heading. Defaults to the component's `label`, then its name.
  label?: string;
  description?: string;
  fields: TFields;
};

type FieldValue<TField extends ComponentSettingField> = TField extends { type: "boolean" }
  ? boolean
  : TField extends { type: "select"; options: readonly { value: infer TValue }[] }
    ? TValue
    : string;

export type ComponentSettingValues<TSettings extends ComponentSiteSettings = ComponentSiteSettings> = {
  [TKey in keyof TSettings["fields"]]: FieldValue<TSettings["fields"][TKey]>;
};

// The values with every secret field left out — what's safe to hand a render or the browser.
export type PublicComponentSettingValues<TSettings extends ComponentSiteSettings = ComponentSiteSettings> = {
  [TKey in keyof TSettings["fields"] as TSettings["fields"][TKey] extends { type: "secret" } ? never : TKey]: FieldValue<
    TSettings["fields"][TKey]
  >;
};

// Identity, for the inferred field types: `const` keeps select option values as literals.
export function defineComponentSiteSettings<const TFields extends Record<string, ComponentSettingField>>(
  settings: ComponentSiteSettings<TFields>,
): ComponentSiteSettings<TFields> {
  return settings;
}

export function componentSettingsKey(componentName: string): string {
  return `component:${componentName}`;
}

export type ComponentWithSiteSettings = {
  name: string;
  label: string;
  settings: ComponentSiteSettings;
};

// The components in `config` that declare site settings, minus those the site can't use.
export function componentsWithSiteSettings(
  config: Partial<Config>,
  disabled: ReadonlySet<string> = new Set(),
): ComponentWithSiteSettings[] {
  return Object.entries(config.components ?? {}).flatMap(([name, component]) => {
    const settings = (component as { siteSettings?: ComponentSiteSettings }).siteSettings;
    if (!settings || disabled.has(name)) return [];
    const label = settings.label ?? (component as { label?: string }).label ?? name;
    return [{ name, label, settings }];
  });
}

function normalizeField(field: ComponentSettingField, value: unknown): string | boolean {
  switch (field.type) {
    case "boolean":
      return typeof value === "boolean" ? value : field.default;
    case "select":
      return typeof value === "string" && field.options.some((option) => option.value === value) ? value : field.default;
    case "secret":
      return typeof value === "string" ? value : "";
    case "text": {
      const text = typeof value === "string" ? value.trim() : "";
      if (!text || (field.pattern && !field.pattern.test(text))) return field.default ?? "";
      return text;
    }
  }
}

// A stored value (anything, including nothing) read as the declared fields' values.
export function normalizeComponentSettings<TSettings extends ComponentSiteSettings>(
  settings: TSettings,
  stored: unknown,
): ComponentSettingValues<TSettings> {
  const source = typeof stored === "object" && stored !== null && !Array.isArray(stored) ? (stored as Record<string, unknown>) : {};
  return Object.fromEntries(
    Object.entries(settings.fields).map(([key, field]) => [key, normalizeField(field, source[key])]),
  ) as ComponentSettingValues<TSettings>;
}

export function publicComponentSettings<TSettings extends ComponentSiteSettings>(
  settings: TSettings,
  values: ComponentSettingValues<TSettings>,
): PublicComponentSettingValues<TSettings> {
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => settings.fields[key]?.type !== "secret"),
  ) as PublicComponentSettingValues<TSettings>;
}
