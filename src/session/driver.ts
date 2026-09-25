import { parse } from "devalue";
import { eq } from "drizzle-orm";
import { getDb } from "../db/db.js";
import { sessions } from "../db/schema.js";

// Astro session driver backed by the `sessions` table. Astro hands us its session map already
// serialized (devalue, a Map of key -> { data, expires }), and reads it back as-is. We also parse
// it on write to keep the queryable `userId` / `tenantId` / `loginId` / `expiresAt` columns in sync with what's
// stored. Sessions aren't row-level-secured: Astro persists them after the request's tenant context
// has already unwound, and they're looked up by their unguessable id anyway.

type SessionEntry = { data: unknown; expires?: number };

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type SessionColumns = { userId: string | null; tenantId: string | null; loginId: string | null; expiresAt: Date | null };

// A live (unexpired) uuid-valued entry, or null.
function uuidEntry(entries: Map<string, SessionEntry>, key: string, now: number): string | null {
  const entry = entries.get(key);
  return entry && !(typeof entry.expires === "number" && entry.expires < now)
    && typeof entry.data === "string" && UUID_REGEX.test(entry.data) ? entry.data : null;
}

export function describe(serialized: string): SessionColumns {
  let entries: Map<string, SessionEntry>;
  try {
    // Same reviver Astro serializes with, so URL values don't make the parse throw.
    entries = parse(serialized, { URL: (href: string) => new URL(href) });
  } catch {
    return { userId: null, tenantId: null, loginId: null, expiresAt: null };
  }
  if (!(entries instanceof Map)) return { userId: null, tenantId: null, loginId: null, expiresAt: null };

  const now = Date.now();
  const userId = uuidEntry(entries, "userId", now);
  // Set alongside userId at login (see login-action.ts) — the tenant the session is signed in to.
  const tenantId = uuidEntry(entries, "tenantId", now);
  // The root-site sign-in this session belongs to (see sessions.login_id in db/schema.ts).
  const loginId = uuidEntry(entries, "loginId", now);

  // The row is dead once its last entry expires; any entry without a ttl keeps it alive forever.
  let latest = 0;
  for (const entry of entries.values()) {
    if (typeof entry.expires !== "number") return { userId, tenantId, loginId, expiresAt: null };
    latest = Math.max(latest, entry.expires);
  }
  return { userId, tenantId, loginId, expiresAt: latest ? new Date(latest) : null };
}

export default function sessionDriver() {
  return {
    async getItem(id: string): Promise<string | null> {
      const [row] = await getDb()
        .select({ data: sessions.data, expiresAt: sessions.expiresAt })
        .from(sessions)
        .where(eq(sessions.id, id))
        .limit(1);
      if (!row || (row.expiresAt && row.expiresAt.getTime() < Date.now())) return null;
      return row.data;
    },

    async setItem(id: string, value: string): Promise<void> {
      const { userId, tenantId, loginId, expiresAt } = describe(value);
      await getDb()
        .insert(sessions)
        .values({ id, data: value, userId, tenantId, loginId, expiresAt })
        .onConflictDoUpdate({
          target: sessions.id,
          set: { data: value, userId, tenantId, loginId, expiresAt, updatedAt: new Date() },
        });
    },

    async removeItem(id: string): Promise<void> {
      await getDb().delete(sessions).where(eq(sessions.id, id));
    },
  };
}
