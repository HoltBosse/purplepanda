import { eq } from "drizzle-orm";
import { getDb } from "../../db/db.js";
import { settings } from "../../db/schema.js";

const SITE_KEY_SETTING = "turnstile_site_key";
const SECRET_KEY_SETTING = "turnstile_secret_key";
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

async function getSettingValue(key: string): Promise<string | undefined> {
  const db = getDb();
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).limit(1);
  return typeof row?.value === "string" && row.value.length > 0 ? row.value : undefined;
}

export function getTurnstileSiteKey(): Promise<string | undefined> {
  return getSettingValue(SITE_KEY_SETTING);
}

// Verifies a submitted Turnstile response token against Cloudflare's siteverify API using the
// account's secret key. Any failure — missing configuration, a network error, or Cloudflare
// rejecting the token — resolves to false, so a broken Turnstile setup fails closed (submissions
// blocked) rather than silently accepting unverified tokens.
export async function verifyTurnstileToken(token: unknown): Promise<boolean> {
  if (typeof token !== "string" || token.length === 0) return false;

  const secretKey = await getSettingValue(SECRET_KEY_SETTING);
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
