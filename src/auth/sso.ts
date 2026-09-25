import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import * as z from "zod";
import { getDb } from "../db/db.js";
import { ssoTokens } from "../db/schema.js";
import { requireTenant } from "../tenant/context.js";

// Signing in once, on the root site, for every tenant's admin. Browsers won't share a cookie
// between unrelated domains, so each tenant still gets its own session on its own domain — the root
// just vouches for the account on the way there: it issues a one-time token for (account, tenant)
// and redirects to that tenant's /admin/sso, which redeems it and signs the account in there. The
// tenant still makes its own access decision on redemption (see admin/sso.ts), so a token only
// ever gets someone in where their account is allowed anyway.

// Long enough for the redirect to land, short enough that a token leaked from a URL (history,
// logs) is useless almost immediately. Single-use regardless.
const TOKEN_TTL_MS = 60 * 1000;

// 32 random bytes, base64url-encoded — exactly what createSsoToken() issues.
export const ssoTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// `loginId` is the root-site sign-in the token is issued under; the tenant session it's redeemed
// for joins that sign-in, so signing out of it ends that session too.
export async function createSsoToken(userId: string, tenantId: string, loginId: string): Promise<string> {
  const db = getDb();
  const token = randomBytes(32).toString("base64url");
  // Expired tokens have no other reason to be cleared, so each issue sweeps them.
  await db.delete(ssoTokens).where(lt(ssoTokens.expiresAt, sql`now()`));
  await db.insert(ssoTokens).values({
    tokenHash: hashToken(token),
    userId,
    tenantId,
    loginId,
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
  });
  return token;
}

// The account (and sign-in) a token was issued for, if it's unexpired and was issued for the
// current tenant. Deleting it in the same statement is what makes it single-use, even with
// concurrent requests.
export async function redeemSsoToken(token: string): Promise<{ userId: string; loginId: string } | null> {
  const [row] = await getDb()
    .delete(ssoTokens)
    .where(and(
      eq(ssoTokens.tokenHash, hashToken(token)),
      eq(ssoTokens.tenantId, requireTenant().id),
      gt(ssoTokens.expiresAt, sql`now()`),
    ))
    .returning({ userId: ssoTokens.userId, loginId: ssoTokens.loginId });
  return row ?? null;
}
