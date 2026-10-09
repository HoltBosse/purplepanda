import { cpus } from 'node:os';
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool, type PoolClient } from 'pg';
import { getTenant } from '../tenant/context.js';

type ConnectCallback = (err: Error | undefined, client: PoolClient | undefined, done: (release?: any) => void) => void;

// Which tenant each pooled connection's `app.tenant_id` setting currently holds ("" for none), so a
// checkout only pays for the extra set_config round trip when the connection last served a
// different tenant rather than on every single query.
const appliedTenant = new WeakMap<PoolClient, string>();

// Every tenant-owned table's row-level security policy (see schema.ts) compares against the
// connection's `app.tenant_id` setting, so each connection has to carry the tenant of whichever
// request is using it. pg-pool funnels both pool.query() and every transaction's checkout through
// connect(), which makes it the one place to pin that setting: read the tenant from the caller's
// async context (tenant/context.ts) and set it on the connection before handing it over. A caller
// with no tenant in context gets the setting cleared rather than inheriting the previous one —
// every policy then matches no rows, so a stray query fails closed instead of reading some
// arbitrary tenant's data.
class TenantPool extends Pool {
  override connect(): Promise<PoolClient>;
  override connect(callback: ConnectCallback): void;
  override connect(callback?: ConnectCallback): Promise<PoolClient> | undefined {
    const tenantId = getTenant()?.id ?? '';
    const checkout = super.connect().then(async (client) => {
      if (appliedTenant.get(client) !== tenantId) {
        try {
          // A brand-new connection has no entry yet, so it always takes this branch on its first
          // checkout — which also makes it the place to pin the session TimeZone to UTC. Every
          // timestamp column is timestamptz, so stored instants don't depend on it, but anything
          // Postgres renders or casts without an explicit zone (text output, a bare '2024-01-01'
          // literal, date_trunc) does. Set here rather than via the pool's `options`, which
          // node-postgres silently replaces with any `?options=` on DATABASE_URL.
          await client.query("SELECT set_config('app.tenant_id', $1, false), set_config('TimeZone', 'UTC', false)", [tenantId]);
        } catch (err) {
          client.release(err as Error);
          throw err;
        }
        appliedTenant.set(client, tenantId);
      }
      return client;
    });

    if (!callback) return checkout;
    checkout.then(
      (client) => callback(undefined, client, (release?: any) => client.release(release)),
      (err: Error) => callback(err, undefined, () => {}),
    ).catch((err) => {
      // An exception thrown by the callback itself — surface it the way pg-pool would have, rather
      // than letting it vanish into this promise chain.
      process.nextTick(() => { throw err; });
    });
  }
}

// node-postgres defaults a bare connection string to `max: 10`, which starves under any real
// concurrency (a single SSR request can issue several queries). Under PM2 cluster mode
// (ecosystem.config.cjs, instances: "max") every CPU core runs its own worker with its own pool,
// so a fixed per-worker max would multiply by core count -- a fixed *total* budget split across
// cores keeps the aggregate bounded regardless of how many workers PM2 forks, and stays well
// under Postgres's own default `max_connections` (100) with headroom for the cache-invalidation
// LISTEN connection each worker also holds (see purplepanda's db/content-cache.ts) plus
// migrations/admin tools.
const TOTAL_CONNECTION_BUDGET = 80;
const pool = new TenantPool({
  connectionString: process.env.DATABASE_URL!,
  max: Math.max(2, Math.floor(TOTAL_CONNECTION_BUDGET / cpus().length)),
});

const db = drizzle(pool);

export default db;
