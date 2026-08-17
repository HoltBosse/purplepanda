import type { ComponentConfig } from "@puckeditor/core";
import * as z from "zod";

type SpaceProps = {
  direction?: "" | "vertical" | "horizontal";
  size: number;
};

// Mirrors the `size` field's own `min: 0` UI hint, which Puck doesn't enforce server-side.
function toPropsSchema() {
  return z.object({ size: z.number().min(0) }).loose();
}

const Space: ComponentConfig<SpaceProps> = {
  propsSchema: toPropsSchema,
  fields: {
    size: {
      type: "number",
      label: "Size",
      min: 0,
    },
    direction: {
      type: "radio",
      label: "Direction",
      options: [
        { label: "Vertical", value: "vertical" },
        { label: "Horizontal", value: "horizontal" },
        { label: "Both", value: "" },
      ],
    },
  },
  defaultProps: {
    direction: "vertical",
    size: 4,
  },
  inline: true,
  render: ({ direction, size, puck }) => {
    const value = `${size * 0.25}rem`;
    return (
      <div
        ref={puck.dragRef}
        style={{
          display: "block",
          width: direction === "vertical" ? "100%" : value,
          height: direction === "horizontal" ? "100%" : value,
        }}
      />
    );
  },
};

export default Space;
