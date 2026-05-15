import type { NodePgDatabase } from "drizzle-orm/node-postgres";

const GLOBAL_KEY = "__purplepanda_db";

export function setDb(db: NodePgDatabase<Record<string, unknown>>) {
  (globalThis as Record<string, unknown>)[GLOBAL_KEY] = db;
}

export function getDb(): NodePgDatabase<Record<string, unknown>> {
  const db = (globalThis as Record<string, unknown>)[GLOBAL_KEY] as NodePgDatabase<Record<string, unknown>> | undefined;
  if (!db) throw new Error("[purplepanda] No db provided. Pass `db` to purplePandaIntegration().");
  return db;
}
