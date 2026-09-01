import { describe, expect, it } from "vitest";
import { pageRootPropsSchema } from "./page-root-schema";

const validImageId = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";

function baseProps(overrides: Record<string, unknown> = {}) {
  return { title: "Home", alias: "home", ...overrides };
}

describe("pageRootPropsSchema", () => {
  it("requires title and alias", () => {
    const schema = pageRootPropsSchema();

    expect(schema.safeParse(baseProps()).success).toBe(true);
    expect(schema.safeParse(baseProps({ title: "" })).success).toBe(false);
    expect(schema.safeParse(baseProps({ alias: "" })).success).toBe(false);
  });

  it("allows og to be entirely absent or an empty object", () => {
    const schema = pageRootPropsSchema();

    expect(schema.safeParse(baseProps()).success).toBe(true);
    expect(schema.safeParse(baseProps({ og: {} })).success).toBe(true);
  });

  it("allows an og title up to 60 characters and rejects longer", () => {
    const schema = pageRootPropsSchema();

    expect(schema.safeParse(baseProps({ og: { title: "a".repeat(60) } })).success).toBe(true);
    expect(schema.safeParse(baseProps({ og: { title: "a".repeat(61) } })).success).toBe(false);
  });

  it("allows an og description up to 160 characters and rejects longer", () => {
    const schema = pageRootPropsSchema();

    expect(schema.safeParse(baseProps({ og: { description: "a".repeat(160) } })).success).toBe(true);
    expect(schema.safeParse(baseProps({ og: { description: "a".repeat(161) } })).success).toBe(false);
  });

  it("allows an og image to be null, absent, or a ref with a valid id", () => {
    const schema = pageRootPropsSchema();

    expect(schema.safeParse(baseProps({ og: {} })).success).toBe(true);
    expect(schema.safeParse(baseProps({ og: { image: null } })).success).toBe(true);
    expect(schema.safeParse(baseProps({ og: { image: { id: validImageId, title: "x", alt: "x" } } })).success).toBe(
      true,
    );
  });

  it("rejects an og image without a valid uuid id", () => {
    const schema = pageRootPropsSchema();

    expect(schema.safeParse(baseProps({ og: { image: {} } })).success).toBe(false);
    expect(schema.safeParse(baseProps({ og: { image: { id: "not-a-uuid" } } })).success).toBe(false);
  });
});
