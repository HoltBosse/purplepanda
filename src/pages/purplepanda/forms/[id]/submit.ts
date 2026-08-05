import type { APIContext, APIRoute } from "astro";
import * as z from "zod";
import { and, eq } from "drizzle-orm";
import type { Config, Data } from "@puckeditor/core";
import { RateLimiterMemory } from "rate-limiter-flexible";
import { alertType, addAlertToSession, createAlert } from "../../../../alert/index.js";
import { getDb } from "../../../../db/db.js";
import { forms, formSubmissions } from "../../../../db/schema.js";
import { has404Page } from "virtual:purplepanda/has-404";
import externalPuckConfig from "virtual:purplepanda/puck-config";
import { buildFormSubmissionSchema, collectSubmissionFieldProcessors } from "../../../../puck/form/schema.js";
import {
  isHoneypotTripped,
  isSubmittedTooFast,
  stripSpamGuardFields,
  verifyCsrfToken,
  CSRF_FIELD_NAME,
} from "../../../../puck/form/spam-guard.js";

const uuidSchema = z.string().uuid();

// Per IP + form: 5 submissions per minute, then blocked for 5 minutes.
const rateLimiter = new RateLimiterMemory({
  points: 5,
  duration: 60,
  blockDuration: 300,
});

// Rejected by Content-Length before the body is ever buffered into memory — request.formData()
// below has no size limit of its own, so without this a single oversized POST (well beyond any
// one field's own validation, e.g. Image.tsx's 10MB cap) could be used to exhaust memory. Sized
// for one image upload plus multipart boundary/header overhead and any other form fields.
const MAX_REQUEST_BYTES = 15 * 1024 * 1024;

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

// Redirects back to the referring page when possible so the visible result matches a normal
// form post and the flash alert set just before calling this renders on that page; falls back
// to a plain-text response when there's no referer to return to.
function redirectBack(request: Request, fallbackMessage: string): Response {
  const referer = request.headers.get("referer");
  if (referer) {
    return new Response(null, { status: 303, headers: { Location: referer } });
  }
  return new Response(fallbackMessage, {
    status: 200,
    headers: { "Content-Type": "text/plain" },
  });
}

// Also used to give bots caught by the honeypot an indistinguishable "success" so they don't
// learn to iterate around it.
async function successResponse(session: APIContext["session"], request: Request): Promise<Response> {
  await addAlertToSession(session, createAlert(alertType.success, "Thanks for your submission!"));
  return redirectBack(request, "Thanks for your submission!");
}

function describeValidationErrors(fieldErrors: Record<string, string[] | undefined>): string {
  const parts = Object.entries(fieldErrors)
    .filter((entry): entry is [string, string[]] => Array.isArray(entry[1]) && entry[1].length > 0)
    .map(([field, messages]) => `${field}: ${messages.join(", ")}`);

  return parts.length > 0
    ? `Please fix the following and resubmit: ${parts.join("; ")}`
    : "Please check the form and try again.";
}

async function validationFailureResponse(
  session: APIContext["session"],
  request: Request,
  fieldErrors: Record<string, string[] | undefined>,
): Promise<Response> {
  await addAlertToSession(session, createAlert(alertType.error, describeValidationErrors(fieldErrors)));
  return redirectBack(request, "There was a problem with your submission.");
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

export const POST: APIRoute = async ({ params, request, rewrite, clientAddress, session, locals }) => {
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

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return new Response("Payload Too Large", { status: 413 });
  }

  try {
    await rateLimiter.consume(`${clientAddress}:${parsedId.data}`);
  } catch {
    return new Response("Too Many Requests", { status: 429, headers: { "Retry-After": "60" } });
  }

  const db = getDb();
  const [form] = await db
    .select({ id: forms.id, content: forms.content })
    .from(forms)
    .where(and(eq(forms.id, parsedId.data), eq(forms.state, 1)))
    .limit(1);

  if (!form) {
    if (has404Page) return rewrite("/404");
    return new Response("Not Found", { status: 404 });
  }

  const formData = await request.formData();
  const data = await formDataToJson(formData);

  // Bots that blanket-fill every field trip the trap; respond as if it succeeded so they don't
  // learn to leave these fields alone.
  if (isHoneypotTripped(data)) {
    return successResponse(session, request);
  }

  // Same fake-success treatment for submissions that arrive faster than a human could plausibly
  // fill the form out.
  if (isSubmittedTooFast(parsedId.data, data[CSRF_FIELD_NAME])) {
    return successResponse(session, request);
  }

  if (!(await verifyCsrfToken(parsedId.data, data[CSRF_FIELD_NAME]))) {
    return new Response("Forbidden", { status: 403 });
  }

  stripSpamGuardFields(data);

  // Fields backed by a component that needs a server-side side effect (e.g. Image.tsx writing an
  // uploaded file to disk and inserting a media row) run against the *raw* FormData value here —
  // formDataToJson above already collapsed any File to bare {name,size,type} metadata, discarding
  // its actual content, so the real value has to be re-read from formData before it's gone. This
  // deliberately runs after the spam/CSRF checks above: a bot's submission never reaches disk or
  // the database, only ones that already passed those gates do.
  const processors = collectSubmissionFieldProcessors(externalPuckConfig as Config, form.content as Data);
  if (processors.size > 0) {
    const processorErrors: Record<string, string[]> = {};
    for (const [key, { props, processSubmission }] of processors) {
      const values = formData.getAll(key);
      const raw = values.length > 1 ? values : values[0];
      try {
        data[key] = await processSubmission(raw, props, locals);
      } catch (err) {
        processorErrors[key] = [err instanceof Error ? err.message : "Invalid submission"];
      }
    }
    if (Object.keys(processorErrors).length > 0) {
      return validationFailureResponse(session, request, processorErrors);
    }
  }

  // Validated against a schema derived from the form's own stored fields, not trusted client
  // input, since the `required`/`inputType` constraints rendered into the HTML are trivially
  // bypassed by posting to this endpoint directly.
  const schema = buildFormSubmissionSchema(externalPuckConfig as Config, form.content as Data);
  const parsed = await schema.safeParseAsync(data);
  if (!parsed.success) {
    return validationFailureResponse(session, request, z.flattenError(parsed.error).fieldErrors);
  }

  await db.insert(formSubmissions).values({ formId: form.id, data: parsed.data });

  return successResponse(session, request);
};
