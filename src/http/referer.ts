import type { APIContext } from "astro";
import * as z from "zod";

// The path (and query) of the page a form was posted from, when the Referer header names a page on
// this same origin — for handlers that send the admin back where they were. A missing, malformed or
// cross-origin Referer gives null rather than throwing or redirecting off-site.
export function sameOriginReferer(context: Pick<APIContext, "request" | "url">): string | null {
  const parsed = z.url().safeParse(context.request.headers.get("referer"));
  if (!parsed.success) return null;
  const url = new URL(parsed.data);
  return url.origin === context.url.origin ? `${url.pathname}${url.search}` : null;
}
