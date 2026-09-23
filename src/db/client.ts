import { cpus } from 'node:os';
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

// node-postgres defaults a bare connection string to `max: 10`, which starves under any real
// concurrency (a single SSR request can issue several queries). Under PM2 cluster mode
// (ecosystem.config.cjs, instances: "max") every CPU core runs its own worker with its own pool,
// so a fixed per-worker max would multiply by core count -- a fixed *total* budget split across
// cores keeps the aggregate bounded regardless of how many workers PM2 forks, and stays well
// under Postgres's own default `max_connections` (100) with headroom for the cache-invalidation
// LISTEN connection each worker also holds (see purplepanda's db/content-cache.ts) plus
// migrations/admin tools.
const TOTAL_CONNECTION_BUDGET = 80;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  max: Math.max(2, Math.floor(TOTAL_CONNECTION_BUDGET / cpus().length)),
});

const db = drizzle(pool);

export default db;