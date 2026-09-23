import * as z from "zod";
import { contentTypeInputSchema } from "../../../../puck/content-types.js";

// How the content type builder in /admin/settings (components/ContentTypeManager.tsx) posts a
// content type, shared by ./create.ts and ./update/[id].ts. Underscore-prefixed so Astro doesn't
// route it.

// `fields` and `jsonld` are posted as JSON strings because they're lists the builder grows a row
// at a time, which a flat form encoding has no shape for. An empty one means "none given".
const jsonPayload = z
    .string()
    .default("")
    .transform((value, ctx) => {
        if (value.trim() === "") return null;
        try {
            return JSON.parse(value) as unknown;
        } catch {
            ctx.addIssue({ code: "custom", message: "Content type could not be read. Please try again." });
            return z.NEVER;
        }
    });

// The posted form, parsed into the shape contentTypeInputSchema validates: every rule about what a
// content type may contain stays in that one schema (shared with the builder's own client-side
// checks), and this only describes how the form carries it.
export const contentTypeFormSchema = z
    .object({
        title: z.string().default(""),
        baseUrl: z.string().default(""),
        fields: jsonPayload,
        jsonld: jsonPayload,
    })
    .transform((form) => ({
        title: form.title,
        baseUrl: form.baseUrl.trim() === "" ? null : form.baseUrl,
        fields: form.fields ?? [],
        jsonLd: form.jsonld,
    }))
    .pipe(contentTypeInputSchema);

// The content type an update/delete names in its URL. Validated before it reaches a query, since a
// malformed value isn't valid Postgres uuid input and would throw rather than just not match.
export const contentTypeIdSchema = z.uuid();

export const SETTINGS_REDIRECT = "/admin/settings#content-types";

export function formatIssues(error: z.ZodError): string {
    return error.issues.map((issue) => issue.message).join("\n");
}
