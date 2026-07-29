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
  // Random component guarantees two tokens issued for the same form in the same millisecond
  // (e.g. two tabs opened at once) still produce distinct tokens, which the reuse cache below
  // relies on to key each issuance uniquely.
  const nonce = randomBytes(9).toString("base64url");
  const payload = `${formId}:${expires}:${nonce}`;
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${Buffer.from(payload, "utf-8").toString("base64url")}.${signature}`;
}

interface DecodedCsrfToken {
  formId: string;
  issuedAt: number;
  expires: number;
  payload: string;
  signature: string;
}

// Splits and base64-decodes a token without checking its signature. Safe to use for the timing
// heuristic below because a tampered `expires`/issuedAt will simply fail the real signature
// check afterward — it can't be used to bypass anything, only to skip the fast-path trap.
function decodeCsrfToken(token: unknown): DecodedCsrfToken | null {
  if (typeof token !== "string") return null;

  const [encodedPayload, signature] = token.split(".");
  if (!encodedPayload || !signature) return null;

  let payload: string;
  try {
    payload = Buffer.from(encodedPayload, "base64url").toString("utf-8");
  } catch {
    return null;
  }

  const [formId, expiresRaw] = payload.split(":");
  const expires = Number(expiresRaw);
  if (!formId || !Number.isFinite(expires)) return null;

  return { formId, expires, issuedAt: expires - CSRF_TTL_MS, payload, signature };
}

// Tokens that have already been used to complete a submission, so a captured/replayed token
// can't be used to flood the same form again within its validity window. Keyed by the full
// token (payload + signature), which `createCsrfToken`'s nonce guarantees is unique per
// issuance; values are the token's own expiry so the sweep below can drop entries once they'd
// fail expiry regardless. In-memory like the rate limiter in submit.ts, so it resets per process
// rather than being shared across a fleet — acceptable for the same reason the rate limiter is.
const usedCsrfTokens = new Map<string, number>();

setInterval(() => {
  const now = Date.now();
  for (const [token, expiresAt] of usedCsrfTokens) {
    if (expiresAt <= now) usedCsrfTokens.delete(token);
  }
}, 5 * 60 * 1000).unref();

// Real humans need at least this long to load the page and fill in a field; bots that submit
// faster are routed to the same fake-success path as the honeypot so they don't learn to add a
// delay. Based on the token's own issuance time rather than a server-side session, so it works
// without needing sticky sessions.
const MIN_FILL_TIME_MS = 1500;

export function isSubmittedTooFast(formId: string, token: unknown): boolean {
  const decoded = decodeCsrfToken(token);
  if (!decoded || decoded.formId !== formId) return false;
  return Date.now() - decoded.issuedAt < MIN_FILL_TIME_MS;
}

export async function verifyCsrfToken(formId: string, token: unknown): Promise<boolean> {
  const decoded = decodeCsrfToken(token);
  if (!decoded || decoded.formId !== formId || Date.now() > decoded.expires) return false;

  const secret = await getCsrfSecret();
  const expectedSignature = createHmac("sha256", secret).update(decoded.payload).digest("base64url");
  const expectedBuf = Buffer.from(expectedSignature);
  const actualBuf = Buffer.from(decoded.signature);
  if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) return false;

  const tokenKey = `${decoded.payload}.${decoded.signature}`;
  if (usedCsrfTokens.has(tokenKey)) return false;
  usedCsrfTokens.set(tokenKey, decoded.expires);

  return true;
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
