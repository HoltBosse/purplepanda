import { AsyncLocalStorage } from "node:async_hooks";

// The tenant a request is being served for, resolved from its hostname by the middleware and
// carried implicitly through everything that request does — queries included. db/client.ts reads it
// whenever it checks a connection out of the pool and pins the connection's `app.tenant_id` setting
// to it, and every tenant-owned table's row-level security policy (see db/schema.ts) filters on that
// setting. So code running inside runWithTenant() only ever sees, and can only ever write, that
// tenant's rows; code running outside it sees none at all.
export interface TenantContext {
  id: string;
  name: string;
  // Whether this is the tenant that owns the root domain (see tenant_domains.is_root) — the one
  // super admins manage every other tenant from.
  isRoot: boolean;
}

const storage = new AsyncLocalStorage<TenantContext>();

// Awaits `fn`'s result *inside* the tenant's context before handing it back. That matters because
// a drizzle query builder is a lazy thenable — `runWithTenant(t, () => db.insert(...))` would
// otherwise return the unexecuted builder, and the query would only run once the caller awaited
// it, back outside the context, as whichever tenant the caller was in.
export function runWithTenant<T>(tenant: TenantContext, fn: () => T | PromiseLike<T>): Promise<T> {
  return storage.run(tenant, async () => await fn());
}

export function getTenant(): TenantContext | undefined {
  return storage.getStore();
}

// For code that only makes sense inside a request (per-tenant caches, anything that writes rows):
// failing loudly beats silently reading or caching nothing under an `undefined` key.
export function requireTenant(): TenantContext {
  const tenant = storage.getStore();
  if (!tenant) {
    throw new Error("[purplepanda] no tenant in context — this code must run inside runWithTenant()");
  }
  return tenant;
}
