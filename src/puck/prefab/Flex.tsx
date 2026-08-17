import type { ComponentConfig, Slot } from "@puckeditor/core";
import * as z from "zod";

type FlexProps = {
  direction: "row" | "column";
  justifyContent: "start" | "center" | "end";
  alignItems: "start" | "center" | "end" | "stretch";
  gap: number;
  wrap: "wrap" | "nowrap";
  items: Slot;
};

// Mirrors the `gap` field's own `min: 0` UI hint, which Puck doesn't enforce server-side.
function toPropsSchema() {
  return z.object({ gap: z.number().min(0) }).loose();
}

const Flex: ComponentConfig<FlexProps> = {
  propsSchema: toPropsSchema,
  fields: {
    direction: {
      type: "radio",
      label: "Direction",
      options: [
        { label: "Row", value: "row" },
        { label: "Column", value: "column" },
      ],
    },
    justifyContent: {
      type: "radio",
      label: "Justify Content",
      options: [
        { label: "Start", value: "start" },
        { label: "Center", value: "center" },
        { label: "End", value: "end" },
      ],
    },
    alignItems: {
      type: "radio",
      label: "Align Items",
      options: [
        { label: "Start", value: "start" },
        { label: "Center", value: "center" },
        { label: "End", value: "end" },
        { label: "Stretch", value: "stretch" },
      ],
    },
    gap: {
      type: "number",
      label: "Gap",
      min: 0,
    },
    wrap: {
      type: "radio",
      label: "Wrap",
      options: [
        { label: "True", value: "wrap" },
        { label: "False", value: "nowrap" },
      ],
    },
    items: {
      type: "slot",
      label: "Items",
    },
  },
  defaultProps: {
    direction: "row",
    justifyContent: "start",
    alignItems: "stretch",
    gap: 4,
    wrap: "wrap",
    items: [],
  },
  render: ({ direction, justifyContent, alignItems, gap, wrap, items: Items }) => {
    return (
      <Items
        style={{
          display: "flex",
          flexDirection: direction,
          justifyContent,
          alignItems,
          gap: `${gap * 0.25}rem`,
          flexWrap: wrap,
        }}
      />
    );
  },
};

export default Flex;
