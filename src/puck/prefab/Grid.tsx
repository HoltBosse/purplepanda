import type { ComponentConfig, Slot } from "@puckeditor/core";

type GridProps = {
  columns: number;
  gap: number;
  content: Slot;
};

const Grid: ComponentConfig<GridProps> = {
  fields: {
    columns: {
      type: "number",
      label: "Columns",
      min: 1,
      max: 254,
    },
    gap: {
      type: "number",
      label: "Gap",
      min: 0,
    },
    content: {
      type: "slot",
      label: "Content",
    },
  },
  defaultProps: {
    columns: 3,
    gap: 4,
    content: [],
  },
  render: ({ columns, gap, content: Content }) => {
    return (
      <Content
        style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: `${gap * 0.25}rem` }}
      />
    );
  },
};

export default Grid;
