import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as z from "zod";
import { getTenantDomainMap } from "../db/content-cache.js";
import type { TenantContext } from "./context.js";
import { normalizeDomain } from "./domains.js";

// Hostname parsing lives in ./domains.ts, which has no server dependencies (the site form's script
// uses it too).
export { domainSchema, normalizeDomain, parseDomainInput, parseDomainList } from "./domains.js";

type Db = NodePgDatabase<Record<string, unknown>>;

// The tenant a request's hostname belongs to, or null when no enabled tenant answers on it. Besides
// the hostnames in tenant_domains, every tenant answers on its hosting hostname (see below).
export async function resolveTenantForHostname(db: Db, hostname: string): Promise<TenantContext | null> {
  const domain = normalizeDomain(hostname);
  if (!domain) return null;
  const map = await getTenantDomainMap(db);
  const hostingId = parseHostingHostname(domain, hostingDomainFor(map.rootDomain));
  // A tenant always has at least one domain of its own, so its first one finds its entry.
  const entry = map.byDomain.get(hostingId ? (map.domainsByTenant.get(hostingId)?.[0] ?? "") : domain);
  if (entry?.tenantState !== 1) return null;
  return { id: entry.tenantId, name: entry.tenantName, isRoot: entry.tenantId === map.rootTenantId };
}

// Every tenant also answers on `<tenant id>.<hosting domain>`: the hostname a site's own domains
// point their DNS at (a CNAME, or an apex's flattened CNAME / ALIAS / ANAME), so one wildcard
// record (`*.hosting.example.com`) sends them all here. The hosting domain is HOSTING_DOMAIN, or
// `hosting.` plus the root domain without it — set HOSTING_DOMAIN in production, or moving the
// root domain changes every site's target and breaks their DNS. Null with no root domain marked.
export function hostingDomainFor(rootDomain: string | null, env: string | undefined = process.env.HOSTING_DOMAIN): string | null {
  const configured = env ? normalizeDomain(env) : null;
  return configured ?? (rootDomain ? `hosting.${rootDomain}` : null);
}

// Where Caddy's on-demand TLS `ask` checks a hostname — see src/pages/purplepanda/tls-ask.ts.
export const TLS_ASK_PATH = "/purplepanda/tls-ask";

export async function getHostingDomain(db: Db): Promise<string | null> {
  return hostingDomainFor((await getTenantDomainMap(db)).rootDomain);
}

export function hostingHostname(tenantId: string, hostingDomain: string): string {
  return `${tenantId.toLowerCase()}.${hostingDomain}`;
}

// The tenant id a hosting hostname names, or null when the (normalized) domain isn't one.
export function parseHostingHostname(domain: string, hostingDomain: string | null): string | null {
  if (!hostingDomain || !domain.endsWith(`.${hostingDomain}`)) return null;
  const label = domain.slice(0, -hostingDomain.length - 1);
  return z.uuid().safeParse(label).success ? label : null;
}

export async function getTenantDomains(db: Db, tenantId: string): Promise<string[]> {
  return (await getTenantDomainMap(db)).domainsByTenant.get(tenantId) ?? [];
}

// The hostname a tenant's others redirect to, if it has marked one (see tenant_domains.is_primary).
export async function getPrimaryDomain(db: Db, tenantId: string): Promise<string | null> {
  return (await getTenantDomainMap(db)).primaryByTenant.get(tenantId) ?? null;
}

// The opt-in Puck components a tenant has enabled — see src/puck/site-components.ts.
export async function getEnabledComponents(db: Db, tenantId: string): Promise<string[]> {
  return (await getTenantDomainMap(db)).componentsByTenant.get(tenantId) ?? [];
}

// Where to build links to the root site: its primary hostname when it has one (so they don't land
// on a hostname that just redirects), else the root domain itself.
export async function getRootDomain(db: Db): Promise<string | null> {
  const map = await getTenantDomainMap(db);
  return (map.rootTenantId && map.primaryByTenant.get(map.rootTenantId)) || map.rootDomain;
}

// The root site itself, for work that has to happen as the root site from another tenant's request
// (e.g. sending account email with the root's mail settings).
export async function getRootTenant(db: Db): Promise<TenantContext | null> {
  const map = await getTenantDomainMap(db);
  const entry = map.rootDomain ? map.byDomain.get(map.rootDomain) : undefined;
  return map.rootTenantId && entry ? { id: map.rootTenantId, name: entry.tenantName, isRoot: true } : null;
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

// An absolute URL for a link sent by email (password resets, invites). Always https on the standard
// port, never the request's scheme or port: with every hostname allowed (astro.config.ts), Astro
// takes those from X-Forwarded-Proto and the Host / X-Forwarded-Host port, so anyone could otherwise
// have someone else's reset link sent as http:// or to some other port.
export function linkUrlOnDomain(domain: string, path: string): string {
  return `https://${domain}${path}`;
}
