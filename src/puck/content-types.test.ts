import { afterEach, describe, expect, it } from "vitest";
import {
  buildJsonLd,
  contentTypeInputSchema,
  findBaseUrlOwner,
  getContentTypeRecords,
  normalizeBaseUrl,
  parseContentTypeFields,
  parseJsonLdConfig,
  puckFieldType,
  setContentTypeRecords,
} from "./content-types";

// Typed loosely on purpose: several cases below feed the schema values it is expected to reject,
// which the parsed input type wouldn't allow.
function baseInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { title: "Article", baseUrl: "/articles", fields: [], jsonLd: null, ...overrides };
}

describe("buildJsonLd", () => {
  it("maps each property to the value of the field it names", () => {
    const jsonLd = buildJsonLd(
      { type: "Article", properties: { headline: "title", description: "summary" } },
      { title: "Road Trip", summary: "Ultimate UP Road Trip" },
    );

    expect(jsonLd).toEqual({ "@type": "Article", headline: "Road Trip", description: "Ultimate UP Road Trip" });
  });

  it("leaves out properties whose source field is empty, missing or unmapped", () => {
    const jsonLd = buildJsonLd(
      { type: "Article", properties: { headline: "title", description: "summary", image: "", author: "byline" } },
      { title: "Road Trip", summary: "" },
    );

    expect(jsonLd).toEqual({ "@type": "Article", headline: "Road Trip" });
  });

  it("returns nothing without a configured type, or when nothing maps to a value", () => {
    expect(buildJsonLd(null, { title: "Road Trip" })).toBeUndefined();
    expect(buildJsonLd(undefined, { title: "Road Trip" })).toBeUndefined();
    expect(buildJsonLd({ type: "Article", properties: { headline: "missing" } }, { title: "Road Trip" })).toBeUndefined();
  });
});

describe("contentTypeInputSchema", () => {
  it("accepts a content type with fields and a structured-data mapping", () => {
    const result = contentTypeInputSchema.safeParse(
      baseInput({
        fields: [
          { name: "description", label: "Description", type: "text" },
          { name: "tier", label: "Tier", type: "select", options: [{ label: "Gold", value: "gold" }] },
        ],
        jsonLd: { type: "Article", properties: { headline: "title" } },
      }),
    );

    expect(result.success).toBe(true);
  });

  it("requires a title, and allows a content type with no base URL or fields", () => {
    expect(contentTypeInputSchema.safeParse(baseInput({ title: "" })).success).toBe(false);
    expect(contentTypeInputSchema.safeParse(baseInput({ baseUrl: null })).success).toBe(true);
  });

  it("rejects a field that would shadow one the editor always supplies", () => {
    const result = contentTypeInputSchema.safeParse(
      baseInput({ fields: [{ name: "title", label: "Title", type: "text" }] }),
    );

    expect(result.success).toBe(false);
  });

  it("rejects a field name that isn't usable as a prop name", () => {
    const result = contentTypeInputSchema.safeParse(
      baseInput({ fields: [{ name: "2 words", label: "Two words", type: "text" }] }),
    );

    expect(result.success).toBe(false);
  });

  it("rejects two fields sharing a name", () => {
    const result = contentTypeInputSchema.safeParse(
      baseInput({
        fields: [
          { name: "description", label: "Description", type: "text" },
          { name: "description", label: "Summary", type: "textarea" },
        ],
      }),
    );

    expect(result.success).toBe(false);
  });

  it("rejects a select or radio field with no options", () => {
    expect(
      contentTypeInputSchema.safeParse(baseInput({ fields: [{ name: "tier", label: "Tier", type: "select" }] })).success,
    ).toBe(false);
    expect(
      contentTypeInputSchema.safeParse(
        baseInput({ fields: [{ name: "tier", label: "Tier", type: "radio", options: [] }] }),
      ).success,
    ).toBe(false);
  });

  it("rejects an unknown field type", () => {
    const result = contentTypeInputSchema.safeParse(
      baseInput({ fields: [{ name: "body", label: "Body", type: "markdown" }] }),
    );

    expect(result.success).toBe(false);
  });
});

describe("parsing stored columns", () => {
  it("degrades to no fields and no structured data rather than throwing", () => {
    expect(parseContentTypeFields(null)).toEqual([]);
    expect(parseContentTypeFields("not a list")).toEqual([]);
    expect(parseContentTypeFields([{ name: "ok" }])).toEqual([]);
    expect(parseJsonLdConfig(null)).toBeNull();
    expect(parseJsonLdConfig({ properties: {} })).toBeNull();
  });

  it("keeps a valid stored value", () => {
    expect(parseContentTypeFields([{ name: "body", label: "Body", type: "richtext" }])).toEqual([
      { name: "body", label: "Body", type: "richtext" },
    ]);
    expect(parseJsonLdConfig({ type: "Article", properties: { headline: "title" } })).toEqual({
      type: "Article",
      properties: { headline: "title" },
    });
  });
});

describe("normalizeBaseUrl", () => {
  it("strips surrounding slashes so a base URL joins cleanly with an alias", () => {
    expect(normalizeBaseUrl("/articles")).toBe("articles");
    expect(normalizeBaseUrl("articles/")).toBe("articles");
    expect(normalizeBaseUrl("/news/articles/")).toBe("news/articles");
  });
});

describe("findBaseUrlOwner", () => {
  const records = [
    { id: "article", title: "Article", baseUrl: "articles", fields: [], jsonLd: null },
    { id: "news", title: "News", baseUrl: "news", fields: [], jsonLd: null },
    { id: "page", title: "Unrouted", baseUrl: null, fields: [], jsonLd: null },
  ];

  it("finds the content type already publishing under a base URL, however it's slashed", () => {
    expect(findBaseUrlOwner(records, "/articles")?.id).toBe("article");
    expect(findBaseUrlOwner(records, "articles/")?.id).toBe("article");
  });

  it("lets a content type keep its own base URL when it's the one being saved", () => {
    expect(findBaseUrlOwner(records, "/articles", "article")).toBeUndefined();
  });

  it("only treats an exact match as a collision, since an alias is a single segment", () => {
    expect(findBaseUrlOwner(records, "/news/articles")).toBeUndefined();
    expect(findBaseUrlOwner(records, "/article")).toBeUndefined();
  });

  it("never collides for a content type with no base URL", () => {
    expect(findBaseUrlOwner(records, null)).toBeUndefined();
    expect(findBaseUrlOwner(records, "/")).toBeUndefined();
  });
});

describe("puckFieldType", () => {
  it("passes Puck's own types through and maps image to a custom field", () => {
    expect(puckFieldType("richtext")).toBe("richtext");
    expect(puckFieldType("image")).toBe("custom");
  });
});

describe("the content type registry", () => {
  afterEach(() => setContentTypeRecords(null));

  it("is empty until something supplies records", () => {
    expect(getContentTypeRecords()).toEqual([]);
  });

  it("hands back whatever was supplied", () => {
    const records = [{ id: "a", title: "Article", baseUrl: "articles", fields: [], jsonLd: null }];
    setContentTypeRecords(records);

    expect(getContentTypeRecords()).toEqual(records);
  });
});
