import { describe, expect, it } from "vitest";
import { contentTypeFormSchema } from "./_form";

// What the builder posts is a flat form whose two list-shaped parts ride along as JSON strings, so
// the schema it's parsed with is the only thing standing between a handcrafted POST and the
// database — these cover the transport it describes, on top of the rules contentTypeInputSchema
// already owns (see src/puck/content-types.test.ts).

function form(overrides: Record<string, string> = {}): Record<string, string> {
    return { title: "Article", baseUrl: "/articles", fields: "[]", jsonld: "", ...overrides };
}

function messages(input: Record<string, string>): string[] {
    const result = contentTypeFormSchema.safeParse(input);
    return result.success ? [] : result.error.issues.map((issue) => issue.message);
}

describe("contentTypeFormSchema", () => {
    it("parses the posted JSON parts into the shape a content type is stored in", () => {
        const result = contentTypeFormSchema.safeParse(
            form({
                fields: JSON.stringify([{ name: "summary", label: "Summary", type: "textarea" }]),
                jsonld: JSON.stringify({ type: "Article", properties: { headline: "title" } }),
            }),
        );

        expect(result.success && result.data).toEqual({
            title: "Article",
            baseUrl: "/articles",
            fields: [{ name: "summary", label: "Summary", type: "textarea" }],
            jsonLd: { type: "Article", properties: { headline: "title" } },
        });
    });

    it("reads an omitted or empty part as none given", () => {
        const result = contentTypeFormSchema.safeParse({ title: "Article" });

        expect(result.success && result.data).toEqual({ title: "Article", baseUrl: null, fields: [], jsonLd: null });
    });

    it("rejects a part that isn't JSON rather than throwing", () => {
        expect(messages(form({ fields: "not json" }))).toEqual(["Content type could not be read. Please try again."]);
        expect(messages(form({ jsonld: "{" }))).toEqual(["Content type could not be read. Please try again."]);
    });

    it("rejects JSON that parses but isn't a content type", () => {
        expect(messages(form({ fields: '"a string"' })).length).toBeGreaterThan(0);
        expect(messages(form({ jsonld: '{"properties":{}}' })).length).toBeGreaterThan(0);
        expect(messages(form({ fields: '[{"name":"summary"}]' })).length).toBeGreaterThan(0);
    });

    it("applies the same content rules the builder enforces in the browser", () => {
        expect(messages(form({ title: "" }))).toContain("A title is required");
        expect(messages(form({ fields: '[{"name":"title","label":"Title","type":"text"}]' })).join()).toContain(
            "reserved",
        );
        expect(messages(form({ fields: '[{"name":"tier","label":"Tier","type":"select"}]' }))).toContain(
            "Select and radio fields need at least one option",
        );
        expect(
            messages(
                form({
                    fields:
                        '[{"name":"summary","label":"Summary","type":"text"},{"name":"summary","label":"Other","type":"text"}]',
                }),
            ),
        ).toContain('Duplicate field name "summary"');
    });
});
