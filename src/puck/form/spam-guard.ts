import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../../db/db.js";
import { settings } from "../../db/schema.js";

const CSRF_SECRET_KEY = "form-csrf-secret";
// Long enough that a slow human filling out the form doesn't get bounced, short enough to
// bound how long a captured token can be replayed.
const CSRF_TTL_MS = 2 * 60 * 60 * 1000;

export const CSRF_FIELD_NAME = "_pp_csrf";
// Two differently-styled traps: bots that blanket-fill every input and bots that only target
// fields that look like real ones (email/url) both get caught.
export const HONEYPOT_FIELD_NAMES = ["_pp_hp", "_pp_hp_email"] as const;

let cachedSecret: string | null = null;

// Lazily created and persisted in the `settings` table (rather than an env var) so the
// integration keeps working with only the `db` option — no extra config surface, and the
// secret survives restarts and is shared across processes.
async function getCsrfSecret(): Promise<string> {
  if (cachedSecret) return cachedSecret;

  const db = getDb();
  const [existing] = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, CSRF_SECRET_KEY))
    .limit(1);
  if (existing) {
    cachedSecret = existing.value as string;
    return cachedSecret;
  }

  const generated = randomBytes(32).toString("base64url");
  // Concurrent first-requests may race to insert; onConflictDoNothing + re-read makes every
  // process converge on whichever secret actually landed in the row, not its own guess.
  await db.insert(settings).values({ key: CSRF_SECRET_KEY, value: generated }).onConflictDoNothing();
  const [row] = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, CSRF_SECRET_KEY)).limit(1);
  cachedSecret = (row?.value as string | undefined) ?? generated;
  return cachedSecret;
}

export async function createCsrfToken(formId: string): Promise<string> {
  const secret = await getCsrfSecret();
  const expires = Date.now() + CSRF_TTL_MS;
  const payload = `${formId}:${expires}`;
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${Buffer.from(payload, "utf-8").toString("base64url")}.${signature}`;
}

export async function verifyCsrfToken(formId: string, token: unknown): Promise<boolean> {
  if (typeof token !== "string") return false;

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return false;

  let payload: string;
  try {
    payload = Buffer.from(encodedPayload, "base64url").toString("utf-8");
  } catch {
    return false;
  }

  const [tokenFormId, expiresRaw] = payload.split(":");
  const expires = Number(expiresRaw);
  if (tokenFormId !== formId || !Number.isFinite(expires) || Date.now() > expires) return false;

  const secret = await getCsrfSecret();
  const expectedSignature = createHmac("sha256", secret).update(payload).digest("base64url");
  const expectedBuf = Buffer.from(expectedSignature);
  const actualBuf = Buffer.from(signature);
  return expectedBuf.length === actualBuf.length && timingSafeEqual(expectedBuf, actualBuf);
}

export function isHoneypotTripped(data: Record<string, unknown>): boolean {
  return HONEYPOT_FIELD_NAMES.some((name) => {
    const value = data[name];
    return typeof value === "string" && value.trim().length > 0;
  });
}

// Removes the guard fields from a submission so they never end up persisted alongside the
// form's real answers.
export function stripSpamGuardFields(data: Record<string, unknown>): void {
  delete data[CSRF_FIELD_NAME];
  for (const name of HONEYPOT_FIELD_NAMES) delete data[name];
}

// Visually hidden off-screen rather than `display:none`/`type="hidden"`, which unsophisticated
// bots specifically know to skip; `tabindex`/`aria-hidden` keep it out of the way for keyboard
// and screen-reader users who tab through the real, visible fields.
export function renderSpamGuardFieldsHtml(csrfToken: string): string {
  const honeypotInputs = HONEYPOT_FIELD_NAMES.map(
    (name) =>
      `<input type="text" name="${name}" value="" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;" />`,
  ).join("");
  return `${honeypotInputs}<input type="hidden" name="${CSRF_FIELD_NAME}" value="${csrfToken}" />`;
}
