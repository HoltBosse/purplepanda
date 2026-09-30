import type { APIContext } from "astro";
import { and, eq, gte } from "drizzle-orm";
import { sendPasswordResetEmail } from "../auth/account-mail.js";
import { parseLoginTarget } from "../auth/login-target.js";
import { forgotPasswordSchema, recordResetRequest } from "../auth/password-reset.js";
import { getDb } from "../db/db.js";
import { users } from "../db/schema.js";

// Emails a password reset link (see auth/password-reset.ts), root site only. Answers exactly the
// same whether or not the email has an account — same redirect, and the token and email are
// handled after the response rather than before it, so the response time doesn't say either.
export async function POST(context: APIContext): Promise<Response> {
  if (!context.locals.tenant.isRoot) {
    return context.rewrite("/404");
  }

  const db = getDb();
  const formData = await context.request.formData();
  const target = parseLoginTarget(formData);
  const input = forgotPasswordSchema.safeParse({ email: formData.get("email") });
  const back = (params: Record<string, string>) =>
    context.redirect(`/forgot-password?${new URLSearchParams({ ...params, ...target })}`);

  if (!input.success) {
    return back({ error: "invalid" });
  }
  const { email } = input.data;

  if (!(await recordResetRequest(email, context.clientAddress))) {
    return back({ error: "throttled" });
  }

  const [user] = await db
    .select({ id: users.id, email: users.email, fname: users.fname })
    .from(users)
    .where(and(eq(users.email, email), gte(users.state, 1)))
    .limit(1);

  if (user) {
    sendPasswordResetEmail(context.url, user, context.locals.tenant.name, target)
      .catch((err) => console.error("[purplepanda] failed to send password reset email", err));
  }

  return back({ sent: "1" });
}
