import type { ComponentConfig, Slot } from "@puckeditor/core";

type FlexProps = {
  direction: "row" | "column";
  justifyContent: "start" | "center" | "end";
  alignItems: "start" | "center" | "end" | "stretch";
  gap: number;
  wrap: "wrap" | "nowrap";
  items: Slot;
};

const Flex: ComponentConfig<FlexProps> = {
  fields: {
    direction: {
      type: "radio",
      options: [
        { label: "Row", value: "row" },
        { label: "Column", value: "column" },
      ],
    },
    justifyContent: {
      type: "radio",
      options: [
        { label: "Start", value: "start" },
        { label: "Center", value: "center" },
        { label: "End", value: "end" },
      ],
    },
    alignItems: {
      type: "radio",
      options: [
        { label: "Start", value: "start" },
        { label: "Center", value: "center" },
        { label: "End", value: "end" },
        { label: "Stretch", value: "stretch" },
      ],
    },
    gap: {
      type: "number",
      min: 0,
    },
    wrap: {
      type: "radio",
      options: [
        { label: "true", value: "wrap" },
        { label: "false", value: "nowrap" },
      ],
    },
    items: {
      type: "slot",
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
