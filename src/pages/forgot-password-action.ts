import type { APIContext } from "astro";
import { and, eq, gte } from "drizzle-orm";
import { parseLoginTarget } from "../auth/login-target.js";
import { createPasswordResetToken, forgotPasswordSchema, recordResetRequest } from "../auth/password-reset.js";
import { getDb } from "../db/db.js";
import { sendMail } from "../db/mail.js";
import { users } from "../db/schema.js";
import { getPrimaryDomain, getRootDomain, urlOnDomain } from "../tenant/index.js";

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

  // The link is built on the root site's own registered hostname (its primary, where it serves),
  // never from the request's Host, so a forged Host header can't make the email point elsewhere.
  const rootDomain = (await getPrimaryDomain(db, context.locals.tenant.id)) ?? (await getRootDomain(db));
  const [user] = await db
    .select({ id: users.id, email: users.email, fname: users.fname })
    .from(users)
    .where(and(eq(users.email, email), gte(users.state, 1)))
    .limit(1);

  if (user && rootDomain) {
    const siteName = context.locals.tenant.name;
    void (async () => {
      const token = await createPasswordResetToken(user.id);
      const link = urlOnDomain(context.url, rootDomain, `/reset-password?${new URLSearchParams({ token, ...target })}`);
      await sendMail(db, {
        to: [user.email],
        subject: `Reset your ${siteName} password`,
        text: [
          `Hi ${user.fname},`,
          "",
          `Someone asked to reset the password for your ${siteName} account. To choose a new one, open this link within the next hour:`,
          "",
          link,
          "",
          "If you didn't ask for this, you can ignore this email: your password won't change.",
        ].join("\n"),
      });
    })().catch((err) => console.error("[purplepanda] failed to send password reset email", err));
  }

  return back({ sent: "1" });
}
