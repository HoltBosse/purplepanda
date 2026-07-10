import type { APIRoute } from "astro";
import * as z from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db/db.js";
import { forms, formSubmissions } from "../../../../db/schema.js";
import { has404Page } from "virtual:purplepanda/has-404";

/* 
  TODO:
  csrf token hidden field as well + ttl
  honeypot added in to every form 
*/

const uuidSchema = z.string().uuid();

function hostOf(headerValue: string | null): string | null {
  if (!headerValue) return null;
  try {
    return new URL(headerValue).host;
  } catch {
    return null;
  }
}

// CSRF guard: the submitting page must be on the same host as this server.
// Origin is preferred; some browsers omit it on same-origin form posts, so
// Referer is used as a fallback.
function isTrustedDomain(request: Request, requestHost: string): boolean {
  const originHost = hostOf(request.headers.get("origin"));
  if (originHost !== null) return originHost === requestHost;

  const refererHost = hostOf(request.headers.get("referer"));
  return refererHost === requestHost;
}

function isAllowedUserAgent(request: Request): boolean {
  const userAgent = request.headers.get("user-agent");
  return !!userAgent && userAgent.startsWith("Mozilla/5.0");
}

async function formDataToJson(formData: FormData): Promise<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for (const key of new Set(formData.keys())) {
    const values = formData.getAll(key).map((value) =>
      value instanceof File ? { name: value.name, size: value.size, type: value.type } : value,
    );
    result[key] = values.length > 1 ? values : values[0];
  }
  return result;
}

export const POST: APIRoute = async ({ params, request, rewrite }) => {
  const parsedId = uuidSchema.safeParse(params.id);
  if (!parsedId.success) {
    if (has404Page) return rewrite("/404");
    return new Response("Not Found", { status: 404 });
  }

  if (!isAllowedUserAgent(request)) {
    return new Response("Forbidden", { status: 403 });
  }

  if (!isTrustedDomain(request, new URL(request.url).host)) {
    return new Response("Forbidden", { status: 403 });
  }

  const db = getDb();
  const [form] = await db
    .select({ id: forms.id })
    .from(forms)
    .where(and(eq(forms.id, parsedId.data), eq(forms.state, 1)))
    .limit(1);

  if (!form) {
    if (has404Page) return rewrite("/404");
    return new Response("Not Found", { status: 404 });
  }

  const formData = await request.formData();
  const data = await formDataToJson(formData);

  await db.insert(formSubmissions).values({ formId: form.id, data });

  const referer = request.headers.get("referer");
  if (referer) {
    return new Response(null, { status: 303, headers: { Location: referer } });
  }

  return new Response("Thanks for your submission!", {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
};
