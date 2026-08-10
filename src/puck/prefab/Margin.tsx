import type { CSSProperties } from "react";
import type { ComponentConfig, Slot } from "@puckeditor/core";

type MarginProps = {
  desktopWidth: number;
  mobileMargin: number;
  content: Slot;
};

const Margin: ComponentConfig<MarginProps> = {
  label: "Margin",
  fields: {
    desktopWidth: {
      type: "number",
      label: "Desktop Width",
      min: 0,
    },
    mobileMargin: {
      type: "number",
      label: "Mobile Margin",
      min: 0,
    },
    content: {
      type: "slot",
      label: "Content",
    },
  },
  defaultProps: {
    desktopWidth: 312,
    mobileMargin: 4,
    content: [],
  },
  render: ({ desktopWidth, mobileMargin, content: Content, id }) => {
    const className = `Margin-${id}`;

    return (
      <>
        <style>{`
          .${className} {
            padding: 0 var(--margin-mobile);
          }
          @media (min-width: 769px) {
            .${className} {
              padding: unset;
              width: var(--margin-desktop-width);
              max-width: var(--margin-desktop-width);
              margin: auto;
            }
          }
        `}</style>
        <Content
          className={className}
          style={
            {
              "--margin-mobile": `${mobileMargin * 0.25}rem`,
              "--margin-desktop-width": `${desktopWidth * 0.25}rem`,
            } as CSSProperties
          }
        />
      </>
    );
  },
};

export default Margin;
