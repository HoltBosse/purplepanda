import db from "virtual:purplepanda/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

export function getDb(): NodePgDatabase<Record<string, unknown>> {
  return db;
}
