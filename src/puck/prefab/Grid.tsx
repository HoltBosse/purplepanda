import type { ComponentConfig, Slot } from "@puckeditor/core";
import { buildGridLayout, DEFAULT_LAYOUT, layoutField, type ResponsiveLayout } from "./card-grid.js";

type GridProps = {
  layout: ResponsiveLayout;
  content: Slot;
};

const Grid: ComponentConfig<GridProps> = {
  fields: {
    layout: layoutField,
    content: {
      type: "slot",
      label: "Content",
    },
  },
  defaultProps: {
    layout: DEFAULT_LAYOUT,
    content: [],
  },
  render: ({ layout, content: Content, id }) => {
    const { className, styleTag, style } = buildGridLayout(id, layout, "Grid");

    return (
      <>
        {styleTag}
        <Content className={className} style={style} />
      </>
    );
  },
};

export default Grid;
