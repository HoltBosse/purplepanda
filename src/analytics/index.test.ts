import { describe, expect, it } from "vitest";
import { analyticsProviders, normalizeAnalyticsSettings, readAnalyticsForm, renderAnalytics } from "./index.js";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

describe("renderAnalytics", () => {
  it("renders nothing when unset or nothing is enabled", () => {
    expect(renderAnalytics(undefined)).toEqual({ head: "", body: "" });
    expect(renderAnalytics({ gtm: { enabled: false, values: { containerId: "GTM-ABC123" } } })).toEqual({ head: "", body: "" });
  });

  it("renders GTM in the head and its noscript fallback in the body", () => {
    const { head, body } = renderAnalytics({ gtm: { enabled: true, values: { containerId: "GTM-ABC123" } } });
    expect(head).toContain("googletagmanager.com/gtm.js");
    expect(head).toContain('"GTM-ABC123"');
    expect(body).toBe(
      '<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-ABC123" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>',
    );
  });

  it("renders several providers in registry order", () => {
    const { head } = renderAnalytics({
      sentry: { enabled: true, values: { publicKey: "0123456789abcdef0123456789abcdef", environment: "" } },
      hotjar: { enabled: true, values: { siteId: "1234567" } },
    });
    expect(head.indexOf("hotjar")).toBeGreaterThan(-1);
    expect(head.indexOf("hotjar")).toBeLessThan(head.indexOf("js.sentry-cdn.com/0123456789abcdef0123456789abcdef.min.js"));
    expect(head).not.toContain("sentryOnLoad");
  });

  it("skips a provider whose stored values don't validate, so nothing unsafe reaches a script", () => {
    const { head, body } = renderAnalytics({
      gtm: { enabled: true, values: { containerId: '"><script>alert(1)</script>' } },
      "meta-pixel": { enabled: true, values: { pixelId: "123456789012345" } },
    });
    expect(head).not.toContain("alert(1)");
    expect(head).not.toContain("gtm.js");
    expect(head).toContain("fbevents.js");
    expect(body).toContain("facebook.com/tr?id=123456789012345");
  });

  it("ignores malformed settings and unknown providers", () => {
    expect(normalizeAnalyticsSettings("nope")).toEqual({});
    expect(normalizeAnalyticsSettings({ unknown: { enabled: true, values: {} }, ga4: { enabled: "yes", values: { measurementId: 5 } } }))
      .toEqual({ ga4: { enabled: false, values: {} } });
  });
});

describe("readAnalyticsForm", () => {
  it("reads every provider, trimming values and treating a missing checkbox as disabled", () => {
    const { settings, errors } = readAnalyticsForm(form({ "ga4-enabled": "on", "ga4-measurementId": " G-ABCDEF123 " }));
    expect(errors).toEqual([]);
    expect(Object.keys(settings)).toEqual(analyticsProviders.map((p) => p.id));
    expect(settings.ga4).toEqual({ enabled: true, values: { measurementId: "G-ABCDEF123" } });
    expect(settings.gtm).toEqual({ enabled: false, values: { containerId: "" } });
  });

  it("requires non-optional fields only when enabled", () => {
    expect(readAnalyticsForm(form({ "clarity-enabled": "on" })).errors).toEqual(["Microsoft Clarity: Project ID is required when enabled."]);
    expect(readAnalyticsForm(form({ "plausible-enabled": "on", "plausible-domain": "example.com" })).errors).toEqual([]);
  });

  it("rejects invalid values even on a disabled provider", () => {
    expect(readAnalyticsForm(form({ "hotjar-siteId": "abc" })).errors).toEqual(["Hotjar: Site ID must be a number."]);
  });
});
