import type { APIContext } from "astro";
import { and, eq, gte } from "drizzle-orm";
import { addAction } from "../audit/index.js";
import { signOutEverywhere } from "../auth/index.js";
import { parseLoginTarget } from "../auth/login-target.js";
import { hashPasswordThrottled } from "../auth/login-throttle.js";
import {
  clearPasswordResetTokens,
  isPasswordResetTokenLive,
  redeemPasswordResetToken,
  resetPasswordSchema,
  resetTokenSchema,
  welcomeSchema,
} from "../auth/password-reset.js";
import { getDb } from "../db/db.js";
import { users } from "../db/schema.js";

// Sets a new password from a reset link (see auth/password-reset.ts), root site only, then signs
// the account out everywhere — whoever else might have been signed in with the old password — and
// sends it to sign in again with the new one.
export async function POST(context: APIContext): Promise<Response> {
  if (!context.locals.tenant.isRoot) {
    return context.rewrite("/404");
  }

  const db = getDb();
  const formData = await context.request.formData();
  const target = parseLoginTarget(formData);
  const welcome = welcomeSchema.safeParse(formData.get("welcome")).success;
  // Carried on every redirect back to the form, so it keeps its wording.
  const pageParams = { ...(welcome ? { welcome: "1" } : {}), ...target };
  const input = resetPasswordSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!input.success) {
    // Without a well-formed token there's no form to go back to; the page reports it as expired.
    const token = resetTokenSchema.safeParse(formData.get("token"));
    const mismatch = input.error.issues.some((issue) => issue.path[0] === "confirmPassword");
    const params = new URLSearchParams({
      ...(token.success ? { token: token.data } : {}),
      error: mismatch ? "mismatch" : "length",
      ...pageParams,
    });
    return context.redirect(`/reset-password?${params}`);
  }
  const { token, password } = input.data;
  const expired = () => context.redirect(`/reset-password?${new URLSearchParams({ token, ...pageParams })}`);

  // Checked (cheaply) before hashing, so a made-up token never costs any scrypt time, and only used
  // up once the new password's hash is in hand, so a busy server doesn't burn the link.
  if (!(await isPasswordResetTokenLive(token))) {
    return expired();
  }
  const hashed = await hashPasswordThrottled(password);
  if (hashed === undefined) {
    return context.redirect(`/reset-password?${new URLSearchParams({ token, error: "busy", ...pageParams })}`);
  }
  const userId = await redeemPasswordResetToken(token);
  if (!userId) {
    return expired();
  }
  const [user] = await db
    .update(users)
    .set({ password: hashed })
    .where(and(eq(users.id, userId), gte(users.state, 1)))
    .returning({ id: users.id });
  if (!user) {
    return expired();
  }

  await clearPasswordResetTokens(user.id);
  await signOutEverywhere(user.id);
  // This browser may still carry a session from before; it no longer exists in storage, but drop
  // it here too rather than leave a stale cookie pointing at it.
  context.session?.destroy();
  await addAction("auth:passwordReset", {}, user.id, { message: "Reset their password" });

  return context.redirect(`/login?${new URLSearchParams({ notice: welcome ? "set" : "reset", ...target })}`);
}
