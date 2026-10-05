import { defineComponentSiteSettings, type PublicComponentSettingValues } from "../component-settings.js";

// Turnstile's keys and widget options, set once per site under Admin → Settings. The option values
// map straight onto the widget's data-* attributes — see
// https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/widget-configurations/
export const turnstileSiteSettings = defineComponentSiteSettings({
  description: "Cloudflare Turnstile keys and widget options, used by every form on this site.",
  fields: {
    siteKey: {
      type: "text",
      label: "Site Key",
    },
    secretKey: {
      type: "secret",
      label: "Secret Key",
    },
    theme: {
      type: "select",
      label: "Theme",
      options: [
        { label: "Match the visitor's system", value: "auto" },
        { label: "Light", value: "light" },
        { label: "Dark", value: "dark" },
      ],
      default: "auto",
    },
    size: {
      type: "select",
      label: "Size",
      options: [
        { label: "Normal (300px wide)", value: "normal" },
        { label: "Flexible (fills the form's width)", value: "flexible" },
        { label: "Compact (150px wide)", value: "compact" },
      ],
      default: "normal",
    },
    appearance: {
      type: "select",
      label: "Appearance",
      description: "When the widget is shown. Most visitors pass without ever needing to interact with it.",
      options: [
        { label: "Always", value: "always" },
        { label: "Once verification starts", value: "execute" },
        { label: "Only when interaction is needed", value: "interaction-only" },
      ],
      default: "always",
    },
    language: {
      type: "text",
      label: "Language",
      description: "\"auto\" follows the visitor's browser, or a language code like en or pt-BR.",
      default: "auto",
      pattern: /^(auto|[a-z]{2,3}(-[a-z]{2,4})?)$/i,
      patternMessage: "Use \"auto\" or a language code like en or pt-BR",
    },
  },
});

export type TurnstileWidgetOptions = PublicComponentSettingValues<typeof turnstileSiteSettings>;
