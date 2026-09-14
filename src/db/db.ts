import db from "virtual:purplepanda/db";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";

export function getDb(): NodePgDatabase<Record<string, unknown>> & { $client: Pool } {
  return db;
}
