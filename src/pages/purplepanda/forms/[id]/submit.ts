import { has404Page } from "virtual:purplepanda/has-404";
import externalPuckConfig from "virtual:purplepanda/puck-config";
import type { Config, Data } from "@puckeditor/core";
import type { APIContext, APIRoute } from "astro";
import { and, eq, inArray } from "drizzle-orm";
import { RateLimiterMemory } from "rate-limiter-flexible";
import * as z from "zod";
import { addAlertToSession, alertType, createAlert } from "../../../../alert/index.js";
import { getDb } from "../../../../db/db.js";
import { sendMail } from "../../../../db/mail.js";
import { resolvePagePathById } from "../../../../db/page-path.js";
import { formSubmissions, forms, users } from "../../../../db/schema.js";
import { emit } from "../../../../hooks/index.js";
import { buildFormSubmissionSchema, collectSubmissionFieldProcessors } from "../../../../puck/form/schema.js";
import {
  CSRF_FIELD_NAME,
  isHoneypotTripped,
  isSubmittedTooFast,
  stripSpamGuardFields,
  verifyCsrfToken,
} from "../../../../puck/form/spam-guard.js";
import {
  collectSubmissionFieldMeta,
  formatSubmissionValue,
  resolveFieldLabel,
  type SubmissionFieldMeta,
  visibleSubmissionFields,
} from "../../../../puck/form/submission-display.js";
import { filterConfigByLocation } from "../../../../puck/index.js";
import { resolveDataForSSR } from "../../../../puck/server-data-wrapper.js";

const uuidSchema = z.uuid();

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
// learn to iterate around it — including the redirect below, since a bot getting a different
// response shape than a real submitter would be its own tell.
async function successResponse(
  session: APIContext["session"],
  request: Request,
  form: { content: unknown },
): Promise<Response> {
  await addAlertToSession(session, createAlert(alertType.success, "Thanks for your submission!"));

  const redirectPageId = (form.content as any)?.root?.props?.redirectPage as string | undefined;
  if (redirectPageId) {
    const path = await resolvePagePathById(getDb(), redirectPageId);
    if (path !== null) {
      return new Response(null, { status: 303, headers: { Location: `/${path}` } });
    }
  }

  return redirectBack(request, "Thanks for your submission!");
}

// Same display rules as the admin submissions table: hide fields whose component opts out (e.g.
// Turnstile's verification token), show the label the form editor set rather than the raw
// `field-<id>` key, and resolve submitted codes (e.g. "option-1") back to the option's label.
async function buildSubmissionFieldMeta(form: { content: unknown }): Promise<SubmissionFieldMeta> {
  const formConfig = filterConfigByLocation((externalPuckConfig as Config) ?? ({} as Config), "form");
  const resolvedFormContent = await resolveDataForSSR(formConfig, form.content as Data);
  return collectSubmissionFieldMeta(formConfig, resolvedFormContent);
}

// Best-effort side effect of a genuine submission (unlike successResponse, this is never invoked
// for the honeypot/spam-timing bypasses) — a failure here shouldn't fail the visitor's submission,
// so callers are expected to catch and log rather than let this reject the request.
async function notifyFormSubmission(
  form: { content: unknown },
  data: Record<string, unknown>,
  submissionUrl: string,
  meta: SubmissionFieldMeta,
): Promise<void> {
  const notifyUserIds = (form.content as any)?.root?.props?.notifyUserIds as string[] | undefined;
  if (!notifyUserIds || notifyUserIds.length === 0) return;

  const db = getDb();
  const recipients = await db
    .select({ email: users.email })
    .from(users)
    .where(and(eq(users.state, 1), inArray(users.id, notifyUserIds)));

  const to = recipients.map((row) => row.email);
  if (to.length === 0) return;

  const replyToUserId = (form.content as any)?.root?.props?.replyTo as string | undefined;
  const replyTo = replyToUserId
    ? await db
        .select({ email: users.email })
        .from(users)
        .where(and(eq(users.state, 1), eq(users.id, replyToUserId)))
        .limit(1)
        .then((rows) => rows[0]?.email)
    : undefined;

  const formName = ((form.content as any)?.root?.props?.name as string | undefined) || "your form";

  // Fields with their own custom rendering (e.g. Image, which normally shows a thumbnail) link to
  // the submission instead — that thumbnail's /image/<id> URL only loads for an admin browsing
  // from the submissions/media admin views (see /image/[id].ts), which an email can't be.
  const lines = visibleSubmissionFields(meta, data).map(
    ([key, value]) => `${resolveFieldLabel(meta, key)}: ${formatSubmissionValue(meta, key, value, submissionUrl)}`,
  );

  await sendMail(db, {
    to,
    subject: `New submission: ${formName}`,
    text: [...lines, "", `View full submission: ${submissionUrl}`].join("\n"),
    replyTo,
  });
}

function describeValidationErrors(
  fieldErrors: Record<string, string[] | undefined>,
  meta: SubmissionFieldMeta,
): string {
  const parts = Object.entries(fieldErrors)
    .filter((entry): entry is [string, string[]] => Array.isArray(entry[1]) && entry[1].length > 0)
    .map(([field, messages]) => `${resolveFieldLabel(meta, field)}: ${messages.join(", ")}`);

  return parts.length > 0
    ? `Please fix the following and resubmit: ${parts.join("; ")}`
    : "Please check the form and try again.";
}

async function validationFailureResponse(
  session: APIContext["session"],
  request: Request,
  fieldErrors: Record<string, string[] | undefined>,
  meta: SubmissionFieldMeta,
): Promise<Response> {
  await addAlertToSession(session, createAlert(alertType.error, describeValidationErrors(fieldErrors, meta)));
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
    return successResponse(session, request, form);
  }

  // Same fake-success treatment for submissions that arrive faster than a human could plausibly
  // fill the form out.
  if (isSubmittedTooFast(parsedId.data, data[CSRF_FIELD_NAME])) {
    return successResponse(session, request, form);
  }

  if (!(await verifyCsrfToken(parsedId.data, data[CSRF_FIELD_NAME]))) {
    return new Response("Forbidden", { status: 403 });
  }

  stripSpamGuardFields(data);

  // Resolved once up front: needed to translate `field-<id>` keys back to their form-editor
  // labels for both validation error messages below and the admin notification email.
  const meta = await buildSubmissionFieldMeta(form);

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
      return validationFailureResponse(session, request, processorErrors, meta);
    }
  }

  // Validated against a schema derived from the form's own stored fields, not trusted client
  // input, since the `required`/`inputType` constraints rendered into the HTML are trivially
  // bypassed by posting to this endpoint directly.
  const schema = buildFormSubmissionSchema(externalPuckConfig as Config, form.content as Data);
  const parsed = await schema.safeParseAsync(data);
  if (!parsed.success) {
    return validationFailureResponse(session, request, z.flattenError(parsed.error).fieldErrors, meta);
  }

  const [inserted] = await db.insert(formSubmissions).values({ formId: form.id, data: parsed.data }).returning();

  if (inserted) {
    await emit("form:submitted", { formId: form.id, data: parsed.data });

    try {
      const submissionUrl = new URL(`/admin/forms/submissions/${inserted.id}`, request.url).toString();
      await notifyFormSubmission(form, parsed.data, submissionUrl, meta);
    } catch (err) {
      console.error(`[purplepanda] Failed to send submission notification for form ${form.id}`, err);
    }
  }

  return successResponse(session, request, form);
};
