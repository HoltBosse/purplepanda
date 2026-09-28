import { parse } from "devalue";
import { eq, lt, or } from "drizzle-orm";
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

// Server-side lifetime of every session, whatever its entries' own ttls say (Astro's session cookie
// has no max-age, so without these a copied cookie would stay valid for as long as its row exists).
// Idle: ends a session nobody has used for this long, measured from `updatedAt`, which getItem()
// bumps (at most every TOUCH_INTERVAL_MS) as well as every write. Absolute: ends it this long after
// `createdAt` however active it is — signing in regenerates the session id (login-action.ts,
// admin/sso.ts), so that's a fresh row and the clock starts at sign-in.
export const SESSION_IDLE_TIMEOUT_MS = 12 * 60 * 60 * 1000;
export const SESSION_ABSOLUTE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;

type SessionLifetime = { createdAt: Date; updatedAt: Date; expiresAt: Date | null };

export function isSessionLive(row: SessionLifetime, now: number): boolean {
  if (row.expiresAt && row.expiresAt.getTime() < now) return false;
  if (row.updatedAt.getTime() < now - SESSION_IDLE_TIMEOUT_MS) return false;
  return row.createdAt.getTime() >= now - SESSION_ABSOLUTE_TIMEOUT_MS;
}

// Dead rows are already unusable (getItem refuses them); this just stops them piling up. Started on
// first use rather than at import so merely importing the driver (e.g. in tests) schedules nothing.
let pruneTimer: ReturnType<typeof setInterval> | undefined;
function schedulePrune() {
  if (pruneTimer) return;
  pruneTimer = setInterval(() => {
    const now = Date.now();
    getDb()
      .delete(sessions)
      .where(
        or(
          lt(sessions.expiresAt, new Date(now)),
          lt(sessions.updatedAt, new Date(now - SESSION_IDLE_TIMEOUT_MS)),
          lt(sessions.createdAt, new Date(now - SESSION_ABSOLUTE_TIMEOUT_MS)),
        ),
      )
      .catch((error: unknown) => console.error("Failed to prune expired sessions", error));
  }, PRUNE_INTERVAL_MS);
  pruneTimer.unref();
}

export default function sessionDriver() {
  return {
    async getItem(id: string): Promise<string | null> {
      schedulePrune();
      const [row] = await getDb()
        .select({ data: sessions.data, createdAt: sessions.createdAt, updatedAt: sessions.updatedAt, expiresAt: sessions.expiresAt })
        .from(sessions)
        .where(eq(sessions.id, id))
        .limit(1);
      const now = Date.now();
      if (!row) return null;
      if (!isSessionLive(row, now)) {
        // Removed rather than left for the prune: Astro keeps using the cookie's id for a session it
        // got nothing back for, and a later write would otherwise upsert onto this row and inherit
        // its stale createdAt, leaving the new session dead on arrival.
        await getDb().delete(sessions).where(eq(sessions.id, id));
        return null;
      }
      if (row.updatedAt.getTime() < now - TOUCH_INTERVAL_MS) {
        await getDb().update(sessions).set({ updatedAt: new Date(now) }).where(eq(sessions.id, id));
      }
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
