import type { ComponentConfig, Slot } from "@puckeditor/core";
import * as z from "zod";
import { DEFAULT_LAYOUT, layoutField, type ResponsiveLayout, responsiveLayoutSchema } from "../component-fields/LayoutField.js";
import { buildGridLayout } from "./card-grid.js";

type GridProps = {
  layout: ResponsiveLayout;
  content: Slot;
};

function toPropsSchema() {
  return z.object({ layout: responsiveLayoutSchema }).loose();
}

const Grid: ComponentConfig<GridProps> = {
  propsSchema: toPropsSchema,
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
