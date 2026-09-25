import type { APIContext } from "astro";
import { and, eq, gte } from "drizzle-orm";
import { addAction } from "../../audit/index.js";
import { isTenantAdmin } from "../../auth/index.js";
import { redeemSsoToken, ssoTokenSchema } from "../../auth/sso.js";
import { getDb } from "../../db/db.js";
import { users } from "../../db/schema.js";
import { getRootDomain, urlOnDomain } from "../../tenant/index.js";

// Any tenant: redeems a one-time token from the root site's sign-in (auth/sso.ts) and signs the
// account in to this tenant's admin with a session of its own. The token only says who the account
// is; whether it gets in is decided here, by the same rule as every other admin request.
export async function GET(context: APIContext): Promise<Response> {
  const db = getDb();
  const token = ssoTokenSchema.safeParse(context.url.searchParams.get("token"));
  const redeemed = token.success ? await redeemSsoToken(token.data) : null;
  const [user] = redeemed
    ? await db.select().from(users).where(and(eq(users.id, redeemed.userId), gte(users.state, 1))).limit(1)
    : [];

  if (!user || !(await isTenantAdmin(user))) {
    const rootDomain = await getRootDomain(db);
    return rootDomain
      ? context.redirect(urlOnDomain(context.url, rootDomain, "/login?error=sso"))
      : new Response("Sign-in failed", { status: 403 });
  }

  await context.session?.regenerate();
  context.session?.set("userId", user.id);
  // Binds the session to this tenant — see getSessionUser() in auth/index.ts.
  context.session?.set("tenantId", context.locals.tenant.id);
  // Joins the root-site sign-in the token came from, so signing out of it ends this session too.
  context.session?.set("loginId", redeemed!.loginId);
  await addAction("auth:login", { method: "sso" }, user.id, { message: "Logged in via {method}" });
  return context.redirect("/admin");
}
