import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as z from "zod";
import { getTenantDomainMap } from "../db/content-cache.js";
import type { TenantContext } from "./context.js";

type Db = NodePgDatabase<Record<string, unknown>>;

// A hostname label: letters, digits and inner hyphens, 1-63 characters. A domain is one or more of
// them (so a bare `localhost` counts, for development) and at most 253 characters overall.
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function isValidDomain(domain: string): boolean {
  return domain.length > 0 && domain.length <= 253 && domain.split(".").every((label) => LABEL.test(label));
}

// The canonical form domains are stored and looked up in: lowercased, without the trailing dot of
// a fully-qualified name. Returns null for anything that isn't a plain hostname.
export function normalizeDomain(hostname: string): string | null {
  const domain = hostname.trim().toLowerCase().replace(/\.$/, "");
  return isValidDomain(domain) ? domain : null;
}

// A hostname from a client (a query param, a form field), validated and normalized as above.
export const domainSchema = z.string().max(253).transform((value, ctx) => {
  const domain = normalizeDomain(value);
  if (!domain) {
    ctx.addIssue({ code: "custom", message: "Not a valid hostname" });
    return z.NEVER;
  }
  return domain;
});

// Lenient parsing for what an admin types into the tenant form: tolerates a pasted URL's scheme
// and trailing slash, but not a path, port or anything else that isn't part of the hostname.
export function parseDomainInput(raw: string): string | null {
  const stripped = raw.trim().replace(/^https?:\/\//i, "").replace(/\/$/, "");
  return normalizeDomain(stripped);
}

// One domain per line (or comma separated), blank lines ignored, duplicates collapsed. `invalid`
// holds whatever didn't parse, as typed, so the form can say which.
export function parseDomainList(raw: string): { domains: string[]; invalid: string[] } {
  const domains = new Set<string>();
  const invalid: string[] = [];
  for (const entry of raw.split(/[\n,]/)) {
    if (!entry.trim()) continue;
    const domain = parseDomainInput(entry);
    if (domain) domains.add(domain);
    else invalid.push(entry.trim());
  }
  return { domains: [...domains], invalid };
}

// The tenant a request's hostname belongs to, or null when no enabled tenant answers on it.
export async function resolveTenantForHostname(db: Db, hostname: string): Promise<TenantContext | null> {
  const domain = normalizeDomain(hostname);
  if (!domain) return null;
  const map = await getTenantDomainMap(db);
  const entry = map.byDomain.get(domain);
  if (entry?.tenantState !== 1) return null;
  return { id: entry.tenantId, name: entry.tenantName, isRoot: entry.tenantId === map.rootTenantId };
}

export async function getTenantDomains(db: Db, tenantId: string): Promise<string[]> {
  return (await getTenantDomainMap(db)).domainsByTenant.get(tenantId) ?? [];
}

// The hostname a tenant's others redirect to, if it has marked one (see tenant_domains.is_primary).
export async function getPrimaryDomain(db: Db, tenantId: string): Promise<string | null> {
  return (await getTenantDomainMap(db)).primaryByTenant.get(tenantId) ?? null;
}

// Where to build links to the root site: its primary hostname when it has one (so they don't land
// on a hostname that just redirects), else the root domain itself.
export async function getRootDomain(db: Db): Promise<string | null> {
  const map = await getTenantDomainMap(db);
  return (map.rootTenantId && map.primaryByTenant.get(map.rootTenantId)) || map.rootDomain;
}

// The hostname to send someone to when a tenant has several and none was asked for. A tenant's
// marked primary is chosen by the caller before this; failing that, a real one over `localhost`,
// then the shortest (so example.com over www.example.com), then alphabetically.
export function pickPrimaryDomain(domains: readonly string[]): string | undefined {
  return [...domains].sort((a, b) =>
    Number(a === "localhost") - Number(b === "localhost") || a.length - b.length || a.localeCompare(b),
  )[0];
}

// An absolute URL on another of this install's hostnames, keeping the current request's scheme and
// port — so it works the same in development (http://…:3012) as behind a TLS-terminating proxy.
export function urlOnDomain(current: URL, domain: string, path: string): string {
  const port = current.port ? `:${current.port}` : "";
  return `${current.protocol}//${domain}${port}${path}`;
}
