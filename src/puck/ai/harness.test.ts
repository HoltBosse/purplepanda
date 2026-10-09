import { describe, expect, it } from "vitest";
import { asSpecs, mediaIdsIn } from "./harness.server.js";

describe("asSpecs", () => {
  it("accepts components, props and slots sent as JSON strings", () => {
    const specs = asSpecs(JSON.stringify([{ type: "Card", props: '{"scheme":"dark"}', slots: { content: '[{"type":"Rich"}]' } }]));
    expect(specs).toEqual([{ type: "Card", props: { scheme: "dark" }, slots: { content: [{ type: "Rich", props: undefined, slots: undefined }] } }]);
  });

  it("repairs a stringified tree with surplus closing brackets", () => {
    expect(asSpecs('[{"type":"Card","slots":{"content":[{"type":"Rich"}]}}]]}')).toEqual([
      { type: "Card", props: undefined, slots: { content: [{ type: "Rich", props: undefined, slots: undefined }] } },
    ]);
  });

  it("takes a lone component as a list of one", () => {
    expect(asSpecs({ type: "Rich" })).toEqual([{ type: "Rich", props: undefined, slots: undefined }]);
  });

  it("rejects input that isn't a list of components", () => {
    expect(() => asSpecs("not json")).toThrow(/array of components/);
    expect(() => asSpecs([{ type: "Card", props: [1] }])).toThrow(/props must be an object/);
  });
});

describe("mediaIdsIn", () => {
  it("finds media references at any depth, but not plain ids", () => {
    const value = [{ image: { id: "m1", title: "Lake", alt: "A lake" } }, { button: { file: { id: "m2", title: "", alt: "" } } }, { id: "Card-1", label: "x" }];
    expect(mediaIdsIn(value)).toEqual(["m1", "m2"]);
  });
});
