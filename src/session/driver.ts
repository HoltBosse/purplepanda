import { parse } from "devalue";
import { eq } from "drizzle-orm";
import { getDb } from "../db/db.js";
import { sessions } from "../db/schema.js";

// Astro session driver backed by the `sessions` table. Astro hands us its session map already
// serialized (devalue, a Map of key -> { data, expires }), and reads it back as-is. We also parse
// it on write to keep the queryable `userId` / `expiresAt` columns in sync with what's stored.

type SessionEntry = { data: unknown; expires?: number };

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function describe(serialized: string): { userId: string | null; expiresAt: Date | null } {
  let entries: Map<string, SessionEntry>;
  try {
    // Same reviver Astro serializes with, so URL values don't make the parse throw.
    entries = parse(serialized, { URL: (href: string) => new URL(href) });
  } catch {
    return { userId: null, expiresAt: null };
  }
  if (!(entries instanceof Map)) return { userId: null, expiresAt: null };

  const now = Date.now();
  const user = entries.get("userId");
  const userId = user && !(typeof user.expires === "number" && user.expires < now)
    && typeof user.data === "string" && UUID_REGEX.test(user.data) ? user.data : null;

  // The row is dead once its last entry expires; any entry without a ttl keeps it alive forever.
  let latest = 0;
  for (const entry of entries.values()) {
    if (typeof entry.expires !== "number") return { userId, expiresAt: null };
    latest = Math.max(latest, entry.expires);
  }
  return { userId, expiresAt: latest ? new Date(latest) : null };
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
      const { userId, expiresAt } = describe(value);
      await getDb()
        .insert(sessions)
        .values({ id, data: value, userId, expiresAt })
        .onConflictDoUpdate({
          target: sessions.id,
          set: { data: value, userId, expiresAt, updatedAt: new Date() },
        });
    },

    async removeItem(id: string): Promise<void> {
      await getDb().delete(sessions).where(eq(sessions.id, id));
    },
  };
}
