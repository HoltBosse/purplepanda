import { eq, type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { getDb } from "../db/db.js";
import { users, userTenants } from "../db/schema.js";
import { requireTenant } from "../tenant/context.js";

// Accounts are shared across tenants (db/schema.ts), so unlike every tenant-owned table the users
// table isn't narrowed to the current tenant by row-level security. Anything listing or picking
// accounts for a tenant — the users admin, the user pickers in forms, notification recipients —
// filters on membership with this instead. This matches members disabled on this tenant too (see
// user_tenants.state); anything offering accounts to pick or notify wants
// isActiveMemberOfCurrentTenant() instead.
export function isMemberOfCurrentTenant(userIdColumn: AnyPgColumn = users.id): SQL {
  const tenantId = requireTenant().id;
  return sql`exists (select 1 from ${userTenants} where ${userTenants.userId} = ${userIdColumn} and ${userTenants.tenantId} = ${tenantId})`;
}

// Members enabled on this tenant only. Doesn't check the account's own state (users.state), which
// callers filter on alongside it.
export function isActiveMemberOfCurrentTenant(userIdColumn: AnyPgColumn = users.id): SQL {
  const tenantId = requireTenant().id;
  return sql`exists (select 1 from ${userTenants} where ${userTenants.userId} = ${userIdColumn} and ${userTenants.tenantId} = ${tenantId} and ${userTenants.state} >= 1)`;
}

export async function getMemberTenantIds(userId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ tenantId: userTenants.tenantId })
    .from(userTenants)
    .where(eq(userTenants.userId, userId));
  return rows.map((row) => row.tenantId);
}

// Whether an account also belongs to a tenant other than the current one — so anything done to the
// account itself, rather than to its membership here, would reach those tenants too. Unlike
// canManageAccount() this doesn't depend on who's asking.
export async function isSharedAccount(targetId: string): Promise<boolean> {
  const currentTenantId = requireTenant().id;
  const memberOf = await getMemberTenantIds(targetId);
  return memberOf.some((tenantId) => tenantId !== currentTenantId);
}

// Whether `editor` may change `target`'s account itself — name, email, password and theme — as
// opposed to just its membership and roles in the current tenant. Those fields
// belong to the account everywhere it's used, so one tenant's admins only get to change them while
// the account belongs to their tenant alone; otherwise they could, say, reset the password of an
// account that also administers another tenant and sign in there as it. A super admin can manage
// any account; nobody else can manage a super admin's.
export async function canManageAccount(
  editor: { superAdmin: boolean },
  target: { id: string; superAdmin: boolean },
): Promise<boolean> {
  if (editor.superAdmin) return true;
  if (target.superAdmin) return false;
  return !(await isSharedAccount(target.id));
}

export async function addTenantMembership(userId: string): Promise<void> {
  await getDb()
    .insert(userTenants)
    .values({ userId, tenantId: requireTenant().id })
    .onConflictDoNothing();
}
