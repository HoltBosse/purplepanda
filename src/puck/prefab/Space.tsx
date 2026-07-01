import type { ComponentConfig } from "@puckeditor/core";

type SpaceProps = {
  direction?: "" | "vertical" | "horizontal";
  size: number;
};

const Space: ComponentConfig<SpaceProps> = {
  fields: {
    size: {
      type: "number",
      min: 0,
    },
    direction: {
      type: "radio",
      options: [
        { label: "Vertical", value: "vertical" },
        { label: "Horizontal", value: "horizontal" },
        { label: "Both", value: "" },
      ],
    },
  },
  defaultProps: {
    direction: "",
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
