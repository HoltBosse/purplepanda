import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import db from "./client.js";

export function getDb(): NodePgDatabase<Record<string, unknown>> & { $client: Pool } {
  return db;
}
