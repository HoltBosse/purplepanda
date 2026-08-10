import type { Config, Data } from "@puckeditor/core";
import { describe, expect, it } from "vitest";
import Checkbox from "../form-fields/Checkbox";
import RadioGroup from "../form-fields/RadioGroup";
import Select from "../form-fields/Select";
import Textarea from "../form-fields/Textarea";
import TextInput from "../form-fields/TextInput";
import { buildFormSubmissionSchema } from "./schema";

const config = {
  components: {
    TextInput,
    Textarea,
    Select,
    Checkbox,
    RadioGroup,
    // A layout component with no `toSubmissionSchema`, mimicking Grid/Flex, to check that
    // fields nested inside a slot are still found and that the wrapper itself is ignored.
    Wrapper: { fields: {} },
  },
} as unknown as Config;

function dataWithContent(content: unknown[]): Data {
  return { root: {}, content } as unknown as Data;
}

describe("buildFormSubmissionSchema", () => {
  it("requires a required text field and rejects blank input", () => {
    const data = dataWithContent([
      { type: "TextInput", props: { id: "name", inputType: "text", required: true } },
    ]);
    const schema = buildFormSubmissionSchema(config, data);

    expect(schema.safeParse({ "field-name": "Ada" }).success).toBe(true);
    expect(schema.safeParse({ "field-name": "" }).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
  });

  it("allows an optional text field to be blank or absent", () => {
    const data = dataWithContent([
      { type: "TextInput", props: { id: "nick", inputType: "text", required: false } },
    ]);
    const schema = buildFormSubmissionSchema(config, data);

    expect(schema.safeParse({ "field-nick": "" }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(true);
  });

  it("validates email format regardless of required", () => {
    const data = dataWithContent([
      { type: "TextInput", props: { id: "email", inputType: "email", required: true } },
    ]);
    const schema = buildFormSubmissionSchema(config, data);

    expect(schema.safeParse({ "field-email": "not-an-email" }).success).toBe(false);
    expect(schema.safeParse({ "field-email": "a@b.com" }).success).toBe(true);
  });

  it("restricts select values to the configured options", () => {
    const data = dataWithContent([
      {
        type: "Select",
        props: {
          id: "color",
          required: true,
          multiple: false,
          options: [
            { label: "Red", value: "red" },
            { label: "Blue", value: "blue" },
          ],
        },
      },
    ]);
    const schema = buildFormSubmissionSchema(config, data);

    expect(schema.safeParse({ "field-color": "red" }).success).toBe(true);
    expect(schema.safeParse({ "field-color": "green" }).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
  });

  it("accepts a single posted value for a multiple select as a one-item array", () => {
    const data = dataWithContent([
      {
        type: "Select",
        props: {
          id: "colors",
          required: true,
          multiple: true,
          options: [
            { label: "Red", value: "red" },
            { label: "Blue", value: "blue" },
          ],
        },
      },
    ]);
    const schema = buildFormSubmissionSchema(config, data);

    const parsed = schema.safeParse({ "field-colors": "red" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data["field-colors"]).toEqual(["red"]);
    expect(schema.safeParse({}).success).toBe(false);
  });

  it("requires a required checkbox to be checked and allows an unchecked optional one", () => {
    const requiredData = dataWithContent([
      { type: "Checkbox", props: { id: "terms", required: true } },
    ]);
    const requiredSchema = buildFormSubmissionSchema(config, requiredData);
    expect(requiredSchema.safeParse({ "field-terms": "on" }).success).toBe(true);
    expect(requiredSchema.safeParse({}).success).toBe(false);

    const optionalData = dataWithContent([
      { type: "Checkbox", props: { id: "newsletter", required: false } },
    ]);
    const optionalSchema = buildFormSubmissionSchema(config, optionalData);
    expect(optionalSchema.safeParse({}).success).toBe(true);
  });

  it("requires a radio group selection to match a configured option", () => {
    const data = dataWithContent([
      {
        type: "RadioGroup",
        props: {
          id: "plan",
          required: true,
          options: [
            { label: "Free", value: "free" },
            { label: "Pro", value: "pro" },
          ],
        },
      },
    ]);
    const schema = buildFormSubmissionSchema(config, data);

    expect(schema.safeParse({ "field-plan": "pro" }).success).toBe(true);
    expect(schema.safeParse({ "field-plan": "enterprise" }).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
  });

  it("finds fields nested inside a slot-bearing layout component", () => {
    const data = dataWithContent([
      {
        type: "Wrapper",
        props: {
          id: "wrapper-1",
          content: [{ type: "TextInput", props: { id: "nested", inputType: "text", required: true } }],
        },
      },
    ]);
    const schema = buildFormSubmissionSchema(config, data);

    expect(schema.safeParse({ "field-nested": "hi" }).success).toBe(true);
    expect(schema.safeParse({}).success).toBe(false);
  });

  it("passes through fields with no matching validator instead of stripping them", () => {
    const data = dataWithContent([]);
    const schema = buildFormSubmissionSchema(config, data);

    const parsed = schema.safeParse({ "honeypot": "", "field-unknown": "anything" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toEqual({ honeypot: "", "field-unknown": "anything" });
  });
});
