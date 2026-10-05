import type { APIContext } from "astro";
import { getDb } from "../../db/db.js";
import { resolveTenantForHostname } from "../../tenant/index.js";

// Caddy's on-demand TLS `ask` endpoint: before getting a certificate for a hostname it has never
// seen, Caddy asks here (GET ?domain=<hostname>) and only goes ahead on a 2xx. That's every hostname
// an enabled site answers on — its domains and its hosting hostname — so a certificate is never
// requested for a domain someone merely pointed at the server. Served on any hostname (Caddy calls
// it as localhost, which is no site's), so the middleware skips tenant resolution for TLS_ASK_PATH.

export async function GET(context: APIContext): Promise<Response> {
  const domain = context.url.searchParams.get("domain") ?? "";
  const tenant = await resolveTenantForHostname(getDb(), domain);
  return new Response(tenant ? "ok" : "unknown domain", {
    status: tenant ? 200 : 404,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
