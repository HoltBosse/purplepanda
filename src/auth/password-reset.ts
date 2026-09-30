import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, gte, lt, sql } from "drizzle-orm";
import { RateLimiterRes } from "rate-limiter-flexible";
import * as z from "zod";
import { getDb } from "../db/db.js";
import { passwordResetTokens, users } from "../db/schema.js";
import { accountKey, limiter } from "./login-throttle.js";

// Resetting a forgotten password, on the root site alongside the one sign-in (see login.astro):
// /forgot-password emails a one-time link to the account's address, and /reset-password redeems it
// to set a new password. Like the sign-in handoff tokens (auth/sso.ts), only a hash is stored, and
// redeeming deletes the row in the same statement, so a link works once.

// Long enough to find the email and act on it; single-use regardless.
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

// 32 random bytes, base64url-encoded — exactly what createPasswordResetToken() issues.
export const resetTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

// `email` has the same bounds as the sign-in username, plus a format check since it's where the
// link is sent (an address that can't be one simply never matches an account anyway).
export const forgotPasswordSchema = z.object({
  email: z.string().trim().max(255).pipe(z.email("Enter a valid email address")),
});

// The same length rules as a password set from the profile (admin/profile/_form.ts), and bounded
// above like the sign-in form so scrypt never chews on megabytes of input.
export const resetPasswordSchema = z.object({
  token: resetTokenSchema,
  password: z.string().min(8, "Password must be at least 8 characters").max(1024, "Password is too long"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

// Errors each page reports back to itself through `?error=`, parsed rather than trusted.
export const forgotPasswordErrorSchema = z.enum(["invalid", "throttled"]);
export const resetPasswordErrorSchema = z.enum(["mismatch", "length", "busy"]);

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Reset requests send email, so they're limited like sign-in attempts, in the same table: per
// address (one client asking for many accounts) and per account (many clients flooding one inbox).
// Every request counts, whether or not the address has an account, so the limits can't tell anyone
// which emails do.
const WINDOW_SECONDS = 60 * 60;
const perAddress = limiter("reset_address", 20, WINDOW_SECONDS);
const perAccount = limiter("reset_account", 5, WINDOW_SECONDS);

// Resolves false when either limit is exhausted, in which case no email may be sent.
export async function recordResetRequest(email: string, address: string): Promise<boolean> {
  const results = await Promise.allSettled([perAddress.consume(address), perAccount.consume(accountKey(email))]);
  for (const result of results) {
    if (result.status === "fulfilled") continue;
    // A limit being hit rejects with a RateLimiterRes; anything else is a store failure.
    if (result.reason instanceof RateLimiterRes) return false;
    throw result.reason;
  }
  return true;
}

// Issues a fresh link for an account, replacing any it already had outstanding, so only the most
// recent email works.
export async function createPasswordResetToken(userId: string): Promise<string> {
  const db = getDb();
  const token = randomBytes(32).toString("base64url");
  // Expired tokens have no other reason to be cleared, so each issue sweeps them.
  await db.delete(passwordResetTokens).where(lt(passwordResetTokens.expiresAt, sql`now()`));
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
  await db.insert(passwordResetTokens).values({
    tokenHash: hashToken(token),
    userId,
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
  });
  return token;
}

// Whether a token would still redeem, without using it up — so /reset-password can say a link has
// expired before asking for a new password.
export async function isPasswordResetTokenLive(token: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ userId: passwordResetTokens.userId })
    .from(passwordResetTokens)
    .innerJoin(users, eq(users.id, passwordResetTokens.userId))
    .where(and(
      eq(passwordResetTokens.tokenHash, hashToken(token)),
      gt(passwordResetTokens.expiresAt, sql`now()`),
      gte(users.state, 1),
    ))
    .limit(1);
  return Boolean(row);
}

// The account a token was issued for, if it's unexpired. Deleting it in the same statement is what
// makes it single-use, even with concurrent requests. The caller still checks the account is live.
export async function redeemPasswordResetToken(token: string): Promise<string | null> {
  const [row] = await getDb()
    .delete(passwordResetTokens)
    .where(and(
      eq(passwordResetTokens.tokenHash, hashToken(token)),
      gt(passwordResetTokens.expiresAt, sql`now()`),
    ))
    .returning({ userId: passwordResetTokens.userId });
  return row?.userId ?? null;
}

// Once a password has been reset, no other link issued before it should still work.
export async function clearPasswordResetTokens(userId: string): Promise<void> {
  await getDb().delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
}
