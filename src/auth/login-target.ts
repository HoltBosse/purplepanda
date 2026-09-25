import * as z from "zod";
import { domainSchema } from "../tenant/index.js";

// Where to send someone once they've signed in on the root site: back to the tenant (and the
// hostname of it) whose /admin/login sent them, or else the dashboard. Carried through /login and
// /login-action as `site` and `host`. Only a tenant id and a hostname ever travel, never a URL, so
// it can't be turned into an open redirect — /sso/[tenantId] checks the hostname is that tenant's.
export interface LoginTarget {
  site?: string;
  host?: string;
}

interface ParamSource {
  get(name: string): unknown;
}

export function parseLoginTarget(params: ParamSource): LoginTarget {
  const site = z.uuid().safeParse(params.get("site"));
  const host = domainSchema.safeParse(params.get("host"));
  return {
    ...(site.success ? { site: site.data } : {}),
    ...(site.success && host.success ? { host: host.data } : {}),
  };
}

export function loginDestination(target: LoginTarget): string {
  if (!target.site) return "/dashboard";
  return target.host
    ? `/sso/${target.site}?host=${encodeURIComponent(target.host)}`
    : `/sso/${target.site}`;
}
