import type { Config } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import {
  collectSubmissionFieldMeta,
  formatSubmissionValue,
  resolveFieldLabel,
  visibleSubmissionFields,
} from "./submission-display";

const config = {
  components: {
    TextInput: {},
    Select: {},
    Checkbox: {},
    // Mirrors Turnstile.tsx: a component whose stored value is a verification token, not a
    // meaningful answer, so it opts out of submission display entirely.
    Turnstile: { submissionDisplay: false },
    // Mirrors Image.tsx: a component whose stored value ({id, title, alt}) is only meaningful
    // rendered as HTML (a thumbnail), never as a plain string.
    Image: { renderSubmissionValue: () => "<img />" },
  },
} as unknown as Config;

const resolvedFormContent = {
  root: {},
  content: [
    { type: "TextInput", props: { id: "name", label: "Full name" } },
    {
      type: "Select",
      props: {
        id: "color",
        label: "Favorite color",
        options: [
          { label: "Red", value: "red" },
          { label: "Blue", value: "blue" },
        ],
      },
    },
    { type: "Checkbox", props: { id: "terms", label: "Terms", checkboxLabel: "I agree to the terms" } },
    { type: "Turnstile", props: { id: "captcha", label: "Verification" } },
    { type: "Image", props: { id: "photo", label: "Photo" } },
  ],
};

describe("collectSubmissionFieldMeta / visibleSubmissionFields", () => {
  it("hides fields whose component opts out via submissionDisplay: false", () => {
    const meta = collectSubmissionFieldMeta(config, resolvedFormContent);
    const data = {
      "field-name": "Ada Lovelace",
      "field-color": "red",
      "field-terms": "on",
      "field-captcha": "0.abc123verificationtoken",
    };

    const fields = visibleSubmissionFields(meta, data);

    expect(fields.map(([key]) => key)).toEqual(["field-name", "field-color", "field-terms"]);
    expect(fields.some(([key]) => key === "field-captcha")).toBe(false);
  });
});

describe("resolveFieldLabel", () => {
  it("returns the form editor's label, falling back to the raw key when unknown", () => {
    const meta = collectSubmissionFieldMeta(config, resolvedFormContent);

    expect(resolveFieldLabel(meta, "field-name")).toBe("Full name");
    expect(resolveFieldLabel(meta, "field-color")).toBe("Favorite color");
    expect(resolveFieldLabel(meta, "field-unknown")).toBe("field-unknown");
  });
});

describe("formatSubmissionValue", () => {
  it("resolves a submitted option code back to its label", () => {
    const meta = collectSubmissionFieldMeta(config, resolvedFormContent);

    expect(formatSubmissionValue(meta, "field-color", "red")).toBe("Red");
    expect(formatSubmissionValue(meta, "field-color", "green")).toBe("green");
  });

  it("shows a checkbox's own label rather than the raw posted value", () => {
    const meta = collectSubmissionFieldMeta(config, resolvedFormContent);

    expect(formatSubmissionValue(meta, "field-terms", "on")).toBe("I agree to the terms");
  });

  it("joins array values, resolving each against its options", () => {
    const meta = collectSubmissionFieldMeta(config, resolvedFormContent);

    expect(formatSubmissionValue(meta, "field-color", ["red", "blue"])).toBe("Red, Blue");
  });

  it("describes a file value with its name, type, and size", () => {
    const meta = collectSubmissionFieldMeta(config, resolvedFormContent);
    const file = { name: "photo.png", type: "image/png", size: 2048 };

    expect(formatSubmissionValue(meta, "field-name", file)).toBe("photo.png (image/png, 2.0 KB)");
  });

  it("falls back to the plain string for a field with no options or checkbox label", () => {
    const meta = collectSubmissionFieldMeta(config, resolvedFormContent);

    expect(formatSubmissionValue(meta, "field-name", "Ada Lovelace")).toBe("Ada Lovelace");
  });

  it("links a custom-render field (e.g. Image) to the submission instead of printing its raw value", () => {
    const meta = collectSubmissionFieldMeta(config, resolvedFormContent);
    const mediaRef = { id: "abc-123", title: "Logo", alt: "" };

    expect(formatSubmissionValue(meta, "field-photo", mediaRef, "https://example.com/admin/forms/submissions/1")).toBe(
      "View in submission: https://example.com/admin/forms/submissions/1",
    );
  });

  it("degrades gracefully for a custom-render field when no submission URL is given", () => {
    const meta = collectSubmissionFieldMeta(config, resolvedFormContent);
    const mediaRef = { id: "abc-123", title: "Logo", alt: "" };

    expect(formatSubmissionValue(meta, "field-photo", mediaRef)).toBe("(see full submission)");
  });

  it("doesn't link a custom-render field left empty (e.g. an optional Image never uploaded)", () => {
    const meta = collectSubmissionFieldMeta(config, resolvedFormContent);

    expect(formatSubmissionValue(meta, "field-photo", undefined, "https://example.com/x")).toBe("");
  });
});
