import type { ComponentConfig, Slot } from "@puckeditor/core";
import type { ReactNode } from "react";
import { BORDER_SIDES, type BorderSide } from "../../theme/types.js";
import { borderAttrs, borderSidesField, themeStyleFields, withoutIdleSides } from "../component-fields/ThemeFields.js";

type CardProps = {
  scheme: string;
  // A border preset, "none", or "" for the theme's card border (on the theme's card sides).
  border?: string | undefined;
  // Only used with a border of the card's own.
  borderSides?: BorderSide[] | undefined;
  content: Slot;
};

export type CardSurfaceProps = {
  scheme?: string | undefined;
  border?: string | undefined;
  borderSides?: BorderSide[] | undefined;
};

// The fields for a card surface's own scheme, border and sides, ready to spread into a component's
// `fields` (hide the sides with withoutIdleSides in its resolveFields). Labels default to the Card's.
export function cardSurfaceFields(labels: { scheme?: string; border?: string; borderSides?: string } = {}) {
  const label = (text: string | undefined) => (text ? { label: text } : {});
  return {
    ...themeStyleFields({ scheme: { ...label(labels.scheme), allowInherit: true }, border: { ...label(labels.border), allowInherit: true } }),
    borderSides: borderSidesField(label(labels.borderSides)),
  };
}

// Defaults for cardSurfaceFields: the surrounding scheme and the theme's card border.
export function cardSurfaceDefaults() {
  return { scheme: "", border: "", borderSides: [...BORDER_SIDES] };
}

// The theme's card surface (see theme.card), with the given scheme and border of its own if any.
export function CardSurface({ scheme, border, borderSides, children }: CardSurfaceProps & { children: ReactNode }) {
  return (
    <div className="pp-card" {...(scheme ? { "data-scheme": scheme } : {})} {...borderAttrs(border, borderSides)}>
      {children}
    </div>
  );
}

// A surface styled by the site theme's card settings (border preset and sides, radius, shadow,
// padding — see theme.card). By default it takes the scheme around it, on its solid background;
// given a scheme of its own it paints that scheme instead, gradient included. A card can also swap
// the theme's border for a preset of its own, on the sides it chooses.
const Card: ComponentConfig<CardProps> = {
  label: "Card",
  fields: {
    ...cardSurfaceFields(),
    content: {
      type: "slot",
      label: "Content",
    },
  },
  defaultProps: {
    ...cardSurfaceDefaults(),
    content: [],
  },
  resolveFields: (data, { fields }) => withoutIdleSides(fields, data.props.border),
  render: ({ scheme, border, borderSides, content: Content }) => (
    <CardSurface scheme={scheme} border={border} borderSides={borderSides}>
      <Content />
    </CardSurface>
  ),
};

export default Card;
