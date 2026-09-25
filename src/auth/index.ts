import type { AstroSession } from "astro";
import { and, eq, gte } from "drizzle-orm";
import * as z from "zod";
import { getDb } from "../db/db.js";
import { roles, sessions, ssoTokens, tenants, userRoles, users, userTenants } from "../db/schema.js";
import { emit, runOverride } from "../hooks/index.js";
import { requireTenant, runWithTenant } from "../tenant/context.js";

// Whether an account belongs to the current tenant, enabled there or not. Explicitly filtered, since
// user_tenants is shared across tenants rather than row-level-secured (see db/schema.ts).
export async function isTenantMember(userId: string): Promise<boolean> {
  const [membership] = await getDb()
    .select({ id: userTenants.id })
    .from(userTenants)
    .where(and(eq(userTenants.userId, userId), eq(userTenants.tenantId, requireTenant().id)))
    .limit(1);
  return Boolean(membership);
}

// Whether an account belongs to the current tenant and is enabled there (user_tenants.state) — the
// membership that access checks count.
export async function isActiveTenantMember(userId: string): Promise<boolean> {
  const [membership] = await getDb()
    .select({ id: userTenants.id })
    .from(userTenants)
    .where(and(eq(userTenants.userId, userId), eq(userTenants.tenantId, requireTenant().id), gte(userTenants.state, 1)))
    .limit(1);
  return Boolean(membership);
}

// Whether an account may sign in to the current tenant's admin at all: a super admin anywhere, or an
// enabled member of this tenant. The role check in isAdminSession() still applies on top for members.
export async function canSignInToTenant(user: { id: string; superAdmin: boolean }): Promise<boolean> {
  return user.superAdmin || (await isActiveTenantMember(user.id));
}

// The session's signed-in account, if it's still live and the session was signed in on the
// current tenant. A session is bound to the tenant it logged in on (session "tenantId") so that it
// can't be replayed against another tenant — e.g. by a spoofed Host/X-Forwarded-Host on a request
// that carries this domain's cookie.
export async function getSessionUser(session: AstroSession | undefined) {
  const [userId, tenantId] = await Promise.all([session?.get("userId"), session?.get("tenantId")]);
  if (!userId || tenantId !== requireTenant().id) {
    return undefined;
  }

  const [user] = await getDb()
    .select()
    .from(users)
    .where(and(eq(users.id, userId), gte(users.state, 1)))
    .limit(1);
  return user;
}

// Same check the /admin middleware gates on: a live user, signed in on this tenant, who is either a
// super admin or an enabled member of this tenant holding an active role that carries adminAccess. Shared
// here so other routes (e.g. /image) can grant admin-only behavior without duplicating (or
// drifting from) that logic.
export async function isAdminSession(session: AstroSession | undefined): Promise<boolean> {
  const user = await getSessionUser(session);
  return user ? isTenantAdmin(user) : false;
}

// Whether a (live) account may use the current tenant's admin — the rule isAdminSession() applies
// to the signed-in account, for callers that already have one in hand: the root site's dashboard
// listing which tenants an account can open, and the sign-in handoff deciding whether to let it in.
export async function isTenantAdmin(user: { id: string; superAdmin: boolean }): Promise<boolean> {
  let defaultIsAdmin = user.superAdmin;
  if (!defaultIsAdmin && (await isActiveTenantMember(user.id))) {
    // roles and user_roles are row-level-secured, so this only ever finds this tenant's roles.
    const [adminRole] = await getDb()
      .select({ id: roles.id })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(and(eq(userRoles.userId, user.id), eq(roles.adminAccess, true), gte(roles.state, 1)))
      .limit(1);
    defaultIsAdmin = !!adminRole;
  }

  // Plugins can replace this decision entirely (e.g. custom SSO/role logic) by returning
  // true/false; returning undefined falls through to the built-in role check above. A
  // non-boolean return is rejected by the schema and treated the same as undefined.
  const override = await runOverride(
    "auth:isAdmin",
    { userId: user.id, tenantId: requireTenant().id, defaultIsAdmin },
    z.boolean(),
  );
  return override ?? defaultIsAdmin;
}

// Signs out of the current sign-in: this browser's session on the root site and every tenant
// session handed over from it (they share a loginId — see sessions.login_id in db/schema.ts), plus
// any handoff token issued under it but not yet redeemed. Ending only this domain's session wouldn't
// do: the root would just sign the browser straight back in the next time it opened an admin. The
// account's sign-ins in other browsers and on other devices are left alone.
//
// A session from before sign-ins carried a loginId just ends on its own.
export async function signOut(session: AstroSession | undefined): Promise<void> {
  const [userId, loginId] = await Promise.all([session?.get("userId"), session?.get("loginId")]);
  session?.destroy();
  if (typeof loginId === "string") {
    await getDb().delete(sessions).where(eq(sessions.loginId, loginId));
    await getDb().delete(ssoTokens).where(eq(ssoTokens.loginId, loginId));
  }
  if (typeof userId === "string") {
    await emit("auth:logout", { userId });
  }
}

// Signs the account out of every sign-in it has, on every site, in every browser and on every
// device: all its sessions and any unredeemed handoff tokens. For an account that may be
// compromised, or after a password change. Not wired to anything yet.
export async function signOutEverywhere(userId: string): Promise<void> {
  await getDb().delete(sessions).where(eq(sessions.userId, userId));
  await getDb().delete(ssoTokens).where(eq(ssoTokens.userId, userId));
  await emit("auth:logout", { userId });
}

// Whether an account can administer more than one site, and so has somewhere to switch to from the
// root site's dashboard: always for a super admin, otherwise when at least two of the enabled sites
// it belongs to give it admin access (the same rule the dashboard lists sites by).
export async function canSwitchSites(user: { id: string; superAdmin: boolean }): Promise<boolean> {
  if (user.superAdmin) return true;
  const memberOf = await getDb()
    .select({ id: tenants.id, name: tenants.name })
    .from(tenants)
    .innerJoin(userTenants, eq(userTenants.tenantId, tenants.id))
    .where(and(eq(tenants.state, 1), eq(userTenants.userId, user.id)));
  if (memberOf.length < 2) return false;

  const current = requireTenant();
  let administrable = 0;
  for (const tenant of memberOf) {
    // The current site is already known to let them in: they're in its admin.
    const allowed = tenant.id === current.id
      || (await runWithTenant({ id: tenant.id, name: tenant.name, isRoot: false }, () => isTenantAdmin(user)));
    if (allowed && ++administrable >= 2) return true;
  }
  return false;
}
