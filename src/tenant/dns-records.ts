import { parse } from "tldts";

// The DNS records a site's domain needs to point at its hosting hostname (see hostingDomainFor() in
// ./index.ts), as the new/edit site form walks an admin through them for their DNS provider. Pure,
// so the form's script can work them out as hostnames are typed.

export interface DnsRecord {
  type: string;
  // Relative to the zone, as providers' forms ask for it: `@` or "" (leave blank) for the apex.
  name: string;
  value: string;
}

export interface DomainDnsInstructions {
  domain: string;
  // "apex" (example.com, example.co.uk), "subdomain" (www.example.com) or "none" (localhost, an IP
  // address, or anything without a registrable domain — nothing to set up).
  kind: "apex" | "subdomain" | "none";
  records: DnsRecord[];
  // Whether `records` are alternatives (add just the first your provider supports) rather than all
  // needed.
  alternatives: boolean;
  // What else to know (where the provider keeps its records, caveats); "" for nothing.
  note: string;
}

interface DnsProvider {
  id: string;
  label: string;
  // How it points an apex at a hostname, or null when it can't (see MOVE_TO_CLOUDFLARE).
  apexType: "CNAME" | "ALIAS" | "ANAME" | null;
  // What its record form wants as the apex's name: "@" or "" (leave the field blank).
  apexName: string;
  // Shown under every one of the provider's domains.
  note?: string;
  apexNote?: string;
}

export const DNS_PROVIDERS: readonly DnsProvider[] = [
  {
    id: "cloudflare",
    label: "Cloudflare",
    apexType: "CNAME",
    apexName: "@",
    note: "Set Proxy status to DNS only (grey cloud), so requests and certificates come straight here.",
    apexNote: "Cloudflare flattens a CNAME at the apex automatically (CNAME flattening).",
  },
  { id: "namecheap", label: "Namecheap", apexType: "ALIAS", apexName: "@", note: "Add these under Domain List → Manage → Advanced DNS." },
  { id: "porkbun", label: "Porkbun", apexType: "ALIAS", apexName: "", note: "Add these under Domain Management → DNS." },
  { id: "dnsimple", label: "DNSimple", apexType: "ALIAS", apexName: "" },
  { id: "dnsmadeeasy", label: "DNS Made Easy", apexType: "ANAME", apexName: "" },
  { id: "godaddy", label: "GoDaddy", apexType: null, apexName: "@", apexNote: "GoDaddy can't point an apex domain at a hostname." },
  { id: "other", label: "Another provider", apexType: null, apexName: "@" },
];

// For an apex whose DNS provider can't point it at a hostname. Never an A record to the server's
// address instead: that breaks, without anyone noticing, whenever the server moves.
export const MOVE_TO_CLOUDFLARE = "Move the domain's nameservers to Cloudflare (free; the domain stays registered where it is), then choose Cloudflare above for the records to add there.";

export function dnsInstructionsFor(domain: string, providerId: string, target: string): DomainDnsInstructions {
  const provider = DNS_PROVIDERS.find((candidate) => candidate.id === providerId) ?? DNS_PROVIDERS[DNS_PROVIDERS.length - 1]!;
  const parsed = parse(domain);
  const note = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(" ");
  if (parsed.isIp || !parsed.domain || !parsed.publicSuffix || parsed.hostname !== domain) {
    return { domain, kind: "none", records: [], alternatives: false, note: "Not a public domain, so there's no DNS to set up." };
  }

  if (parsed.subdomain) {
    return { domain, kind: "subdomain", records: [{ type: "CNAME", name: parsed.subdomain, value: target }], alternatives: false, note: note(provider.note) };
  }

  if (provider.apexType) {
    return { domain, kind: "apex", records: [{ type: provider.apexType, name: provider.apexName, value: target }], alternatives: false, note: note(provider.apexNote, provider.note) };
  }

  if (provider.id === "other") {
    // An apex can't have a plain CNAME, so it's whichever stand-in for one the provider offers.
    const name = provider.apexName;
    return {
      domain,
      kind: "apex",
      records: [
        { type: "CNAME", name, value: target },
        { type: "ALIAS", name, value: target },
        { type: "ANAME", name, value: target },
      ],
      alternatives: true,
      note: `A CNAME only works at the apex where the provider flattens it ("CNAME flattening"); otherwise use its ALIAS or ANAME record. If the provider has none of these: ${MOVE_TO_CLOUDFLARE}`,
    };
  }

  return { domain, kind: "apex", records: [], alternatives: false, note: note(provider.apexNote, MOVE_TO_CLOUDFLARE) };
}
