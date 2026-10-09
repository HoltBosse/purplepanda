import type { Config } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import { buildCatalog, buildComponentCatalog, buildRootCatalog } from "./catalog.js";
import { withAiHint } from "./hint.js";

const config = {
  root: { fields: { title: { type: "text", label: "Title" } } },
  components: {
    Button: {
      label: "Button",
      fields: {
        children: { type: "text", label: "Label" },
        size: { type: "select", options: [{ label: "S", value: "sm" }, { label: "L", value: "lg" }] },
        variant: withAiHint({ type: "custom", render: () => null }, () => 'one of "primary"'),
        opaque: { type: "custom", render: () => null },
      },
      defaultProps: { children: "Button", size: "sm", variant: "primary" },
      render: () => null,
    },
    Section: {
      fields: { content: { type: "slot" }, items: { type: "array", arrayFields: { name: { type: "text" } } } },
      defaultProps: { content: [], items: [] },
      render: () => null,
    },
    Secret: { fields: {}, render: () => null },
  },
} as unknown as Config;

describe("buildCatalog", () => {
  const catalog = buildCatalog(config, { disabled: new Set(["Secret"]) });

  it("describes props with labels, choices, hints and defaults", () => {
    expect(catalog).toContain('## Button\n- children "Label": string = "Button"');
    expect(catalog).toContain('- size: one of "sm" | "lg" = "sm"');
    expect(catalog).toContain('- variant: one of "primary" = "primary"');
    expect(catalog).toContain("- opaque: custom (leave unchanged)");
  });

  it("marks slots and expands array items", () => {
    expect(catalog).toContain("- content: slot");
    expect(catalog).toContain("- items: array of objects with:\n  - name: string");
  });

  it("includes root settings and leaves out disabled components", () => {
    expect(catalog).toContain('## root (page settings; update with id "root")\n- title: string');
    expect(catalog).not.toContain("Secret");
  });
});

describe("buildRootCatalog / buildComponentCatalog", () => {
  it("split the catalog into the page settings and the components", () => {
    expect(buildRootCatalog(config)).toBe('## root (page settings; update with id "root")\n- title: string');
    const components = buildComponentCatalog(config, { disabled: new Set(["Secret"]) });
    expect(components).toContain("## Button");
    expect(components).not.toContain("## root");
    expect(buildCatalog(config, { disabled: new Set(["Secret"]) })).toBe(`${buildRootCatalog(config)}\n\n${components}`);
  });
});
