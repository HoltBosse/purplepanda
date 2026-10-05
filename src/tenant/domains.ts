import * as z from "zod";

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
