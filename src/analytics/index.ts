import { type AnalyticsProvider, type AnalyticsValues, analyticsProviders } from "./providers.js";

export type { AnalyticsField, AnalyticsProvider, AnalyticsValues } from "./providers.js";
export { analyticsProviders, getAnalyticsProvider } from "./providers.js";

// The settings row holding every provider's configuration, keyed by provider id. Providers that
// were never configured simply have no entry.
export const ANALYTICS_SETTING_KEY = "analytics";

export interface AnalyticsProviderSettings {
  enabled: boolean;
  values: AnalyticsValues;
}

export type AnalyticsSettings = Record<string, AnalyticsProviderSettings>;

// The stored setting, read defensively: anything that isn't the expected shape (a hand-edited row,
// a provider since removed) is dropped rather than trusted.
export function normalizeAnalyticsSettings(raw: unknown): AnalyticsSettings {
  const result: AnalyticsSettings = {};
  if (typeof raw !== "object" || raw === null) return result;

  for (const provider of analyticsProviders) {
    const entry = (raw as Record<string, unknown>)[provider.id];
    if (typeof entry !== "object" || entry === null) continue;
    const { enabled, values } = entry as { enabled?: unknown; values?: unknown };
    const cleanValues: AnalyticsValues = {};
    if (typeof values === "object" && values !== null) {
      for (const field of provider.fields) {
        const value = (values as Record<string, unknown>)[field.name];
        if (typeof value === "string") cleanValues[field.name] = value;
      }
    }
    result[provider.id] = { enabled: enabled === true, values: cleanValues };
  }
  return result;
}

// Checks a provider's values against its fields. An enabled provider needs every non-optional
// field; a disabled one may be left partly filled in, but whatever is filled in must still be
// valid. Returns one message per problem.
export function validateProviderSettings(provider: AnalyticsProvider, settings: AnalyticsProviderSettings): string[] {
  const errors: string[] = [];
  for (const field of provider.fields) {
    const value = settings.values[field.name] ?? "";
    if (value === "") {
      if (settings.enabled && !field.optional) errors.push(`${provider.name}: ${field.label} is required when enabled.`);
      continue;
    }
    if (!field.pattern.test(value)) errors.push(`${provider.name}: ${field.label} ${field.patternMessage}.`);
  }
  return errors;
}

// Reads the analytics screen's form. Field names are `<providerId>-enabled` (a checkbox) and
// `<providerId>-<fieldName>`.
export function readAnalyticsForm(formData: FormData): { settings: AnalyticsSettings; errors: string[] } {
  const settings: AnalyticsSettings = {};
  const errors: string[] = [];
  for (const provider of analyticsProviders) {
    const values: AnalyticsValues = {};
    for (const field of provider.fields) {
      values[field.name] = String(formData.get(`${provider.id}-${field.name}`) ?? "").trim();
    }
    const entry = { enabled: formData.get(`${provider.id}-enabled`) === "on", values };
    errors.push(...validateProviderSettings(provider, entry));
    settings[provider.id] = entry;
  }
  return { settings, errors };
}

// The markup every public page adds for the enabled providers. A provider whose stored values no
// longer validate is skipped rather than rendered, since its values go straight into scripts.
export function renderAnalytics(raw: unknown): { head: string; body: string } {
  const settings = normalizeAnalyticsSettings(raw);
  const head: string[] = [];
  const body: string[] = [];
  for (const provider of analyticsProviders) {
    const entry = settings[provider.id];
    if (!entry?.enabled || validateProviderSettings(provider, entry).length > 0) continue;
    head.push(provider.head(entry.values));
    if (provider.body) body.push(provider.body(entry.values));
  }
  return { head: head.join("\n"), body: body.join("\n") };
}
