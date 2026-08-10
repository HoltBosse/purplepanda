import type { AstroSession } from "astro";
import { and, eq, gte } from "drizzle-orm";
import { getDb } from "../db/db.js";
import { roles, userRoles, users } from "../db/schema.js";

// Same check the /admin middleware gates on: a live user with an active role
// that carries adminAccess. Shared here so other routes (e.g. /image) can grant
// admin-only behavior without duplicating (or drifting from) that logic.
export async function isAdminSession(session: AstroSession | undefined): Promise<boolean> {
  const userId = await session?.get("userId");
  if (!userId) {
    return false;
  }

  const db = getDb();

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), gte(users.state, 1)))
    .limit(1);

  if (!user) {
    return false;
  }

  const [adminRole] = await db
    .select({ id: roles.id })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(and(eq(userRoles.userId, userId), eq(roles.adminAccess, true), gte(roles.state, 1)))
    .limit(1);

  return !!adminRole;
}
