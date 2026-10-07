import type { ComponentConfig, Slot } from "@puckeditor/core";
import * as z from "zod";
import { type BorderSide, REPLACEMENT_DEFAULTS } from "../../theme/index.js";
import { units } from "../../theme/units.js";
import { borderAttrs, borderSidesField, themeStyleFields, withoutIdleSides } from "../component-fields/ThemeFields.js";

type SectionProps = {
  scheme: string;
  // A border preset, or "none"/"" for no border.
  border?: string | undefined;
  borderSides?: BorderSide[] | undefined;
  paddingY: number;
  paddingX: number;
  content: Slot;
};

// A full-width band in one of the site theme's color schemes. Everything inside takes its colors
// from the scheme (text, muted text, buttons, borders) through CSS custom properties, so nothing
// placed in it needs a color of its own. A border, typically on the top and bottom edges, divides
// it from the bands around it. Padding is in component units.
function toPropsSchema() {
  return z.object({ paddingY: z.number().min(0), paddingX: z.number().min(0) }).loose();
}

const Section: ComponentConfig<SectionProps> = {
  label: "Section",
  propsSchema: toPropsSchema,
  fields: {
    ...themeStyleFields({ scheme: {}, border: {} }),
    borderSides: borderSidesField(),
    paddingY: {
      type: "number",
      label: "Vertical spacing (units)",
      min: 0,
    },
    paddingX: {
      type: "number",
      label: "Horizontal spacing (units)",
      min: 0,
    },
    content: {
      type: "slot",
      label: "Content",
    },
  },
  defaultProps: {
    scheme: REPLACEMENT_DEFAULTS.scheme,
    border: "",
    borderSides: ["top", "bottom"],
    paddingY: 12,
    paddingX: 4,
    content: [],
  },
  resolveFields: (data, { fields }) => withoutIdleSides(fields, data.props.border),
  render: ({ scheme, border, borderSides, paddingY, paddingX, content: Content }) => (
    <section data-scheme={scheme || REPLACEMENT_DEFAULTS.scheme} {...borderAttrs(border, borderSides)} style={{ padding: `${units(paddingY ?? 0)} ${units(paddingX ?? 0)}` }}>
      <Content />
    </section>
  ),
};

export default Section;
