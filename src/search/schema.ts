import * as z from "zod";
import type { SearchFieldSpec, SearchFieldType } from "./types.js";

export const searchFieldTypeSchema: z.ZodType<SearchFieldType> = z.enum([
  "text",
  "boolean",
  "date",
  "datetime",
  "time",
  "enum",
]);

/** Validates a caller-supplied field config array (not user query input — see `valueSchemaForField`). */
export const searchFieldSpecSchema: z.ZodType<SearchFieldSpec> = z
  .object({
    name: z
      .string()
      .min(1)
      .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "field name must be a valid identifier"),
    type: searchFieldTypeSchema,
    label: z.string().optional(),
    description: z.string().optional(),
    nullable: z.boolean().optional(),
    enumValues: z.array(z.string().min(1)).optional(),
    wildcard: z.boolean().optional(),
  })
  .refine((f) => f.type !== "enum" || (f.enumValues && f.enumValues.length > 0), {
    message: "enum fields require a non-empty enumValues list",
    path: ["enumValues"],
  });

export const searchFieldsConfigSchema: z.ZodType<SearchFieldSpec[]> = z.array(searchFieldSpecSchema);

const DATETIME_SCHEMA = z.union([z.iso.date(), z.iso.datetime({ local: true })]);

/**
 * Builds the zod schema that a raw (unquoted) token value must satisfy for the given field's
 * type. `null`/boolean literals are matched case-sensitively, per the grammar (`member:true`,
 * not `member:True`).
 */
export function valueSchemaForField(field: Pick<SearchFieldSpec, "type" | "enumValues">): z.ZodType<string> {
  switch (field.type) {
    case "boolean":
      return z.enum(["true", "false"]);
    case "date":
      return z.iso.date();
    case "datetime":
      return DATETIME_SCHEMA;
    case "time":
      return z.iso.time();
    case "enum":
      return z.enum((field.enumValues ?? []) as [string, ...string[]]);
    default:
      return z.string().min(1);
  }
}
