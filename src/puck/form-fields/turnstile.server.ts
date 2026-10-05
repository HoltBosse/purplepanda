import { publicComponentSettings } from "../component-settings.js";
import { getComponentSettings } from "../component-settings.server.js";
import { type TurnstileWidgetOptions, turnstileSiteSettings } from "./turnstile-settings.js";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function getTurnstileSettings() {
  return getComponentSettings("Turnstile", turnstileSiteSettings);
}

// The widget's options for the current site, or undefined until both keys are set — a widget with
// no secret to verify against would only ever produce submissions that fail.
export async function getTurnstileWidgetOptions(): Promise<TurnstileWidgetOptions | undefined> {
  const settings = await getTurnstileSettings();
  if (!settings.siteKey || !settings.secretKey) return undefined;
  return publicComponentSettings(turnstileSiteSettings, settings);
}

// Verifies a submitted Turnstile response token against Cloudflare's siteverify API using the
// account's secret key. Any failure — missing configuration, a network error, or Cloudflare
// rejecting the token — resolves to false, so a broken Turnstile setup fails closed (submissions
// blocked) rather than silently accepting unverified tokens.
export async function verifyTurnstileToken(token: unknown): Promise<boolean> {
  if (typeof token !== "string" || token.length === 0) return false;

  const { secretKey } = await getTurnstileSettings();
  if (!secretKey) return false;

  try {
    const response = await fetch(VERIFY_URL, {
      method: "POST",
      body: new URLSearchParams({ secret: secretKey, response: token }),
    });
    if (!response.ok) return false;

    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch {
    return false;
  }
}
