import type { ComponentConfig, Field } from "@puckeditor/core";
import type { CSSProperties } from "react";
import { REPLACEMENT_DEFAULTS } from "../../theme/index.js";
import { units } from "../../theme/units.js";
import { type ImageConfig, imageField } from "../component-fields/ImageField.js";
import { themeStyleFields, variantClass } from "../component-fields/ThemeFields.js";
import { categoryField } from "./CategoryObjectField.js";

type ImagePosition = "start" | "end";

export type ButtonProps = {
  children: string;
  href: string;
  // A button variant id from the site theme. Buttons saved before variants existed have none and
  // render as Primary, which is what they were.
  variant?: string;
  // Grouped under one collapsed "Image" section in the editor (see imageGroupField) — most
  // buttons are text-only, so these stay out of the way until someone wants an image.
  image?: {
    file?: ImageConfig | null;
    position?: ImagePosition;
    gap?: number;
  };
};

// The image sits beside the label in a flex row rather than in a slot: a slot would let
// authors drop links, forms or other buttons inside the <a>/<button> (invalid nested interactive
// content), and flat props stay JSON-serializable and bindable.
const flexDirection: Record<ImagePosition, CSSProperties["flexDirection"]> = {
  start: "row",
  end: "row-reverse",
};

// Content shared by both the link and submit renders. With no image the label is rendered bare,
// so existing buttons keep their exact markup.
function ButtonContent({ children, image }: ButtonProps) {
  const file = image?.file;
  if (!file?.id) return <>{children}</>;

  const base = `/image/${file.id}`;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        flexDirection: flexDirection[image?.position ?? "start"] ?? "row",
        gap: units(image?.gap ?? 2),
      }}
    >
      <picture>
        <source srcSet={`${base}?fmt=webp`} type="image/webp" />
        <source srcSet={`${base}?fmt=png`} type="image/png" />
        <img
          src={`${base}?fmt=png`}
          // Decorative: the label beside it already names the button.
          alt=""
          // Sized to the label's line height rather than by the picker — explicit pixel sizes
          // and crops would push the button out of shape, so the field runs in minimal mode.
          style={{ height: "1.25em", width: "auto" }}
        />
      </picture>
      <span>{children}</span>
    </span>
  );
}

const imageGroupField = categoryField(
  "Image",
  {
    // Minimal: the image is always sized to the label (see ButtonContent), so the picker's
    // crop/focus/sizing controls would only produce values that get ignored.
    file: { ...imageField, label: "Image", minimal: true, optional: true } as Field,
    position: {
      type: "radio",
      label: "Position",
      options: [
        { label: "Start", value: "start" },
        { label: "End", value: "end" },
      ],
    },
    gap: {
      type: "number",
      label: "Gap",
      min: 0,
    },
  },
  { defaultExpanded: false },
) as Field<ButtonProps["image"]>;

const imageDefaults: ButtonProps["image"] = { file: null, position: "start", gap: 2 };

const styleFields = themeStyleFields({ variant: {} });

// A link styled as a button everywhere but forms, where it's the form's submit button instead —
// a link there would leave the page without submitting, and a submit button outside a form does
// nothing. See locationOverrides in ../index.ts.
const Button: ComponentConfig<ButtonProps> = {
  label: "Button",
  fields: {
    children: {
      type: "text",
      label: "Label",
    },
    href: {
      type: "text",
      label: "Link",
    },
    ...styleFields,
    image: imageGroupField,
  },
  defaultProps: {
    children: "Button",
    href: "",
    variant: REPLACEMENT_DEFAULTS.variant,
    image: imageDefaults,
  },
  render: (props) => {
    return (
      <a className={variantClass(props.variant)} href={props.href || undefined}>
        <ButtonContent {...props} />
      </a>
    );
  },
  locationOverrides: {
    form: {
      fields: {
        children: {
          type: "text",
          label: "Label",
        },
        ...styleFields,
        image: imageGroupField,
      },
      defaultProps: {
        children: "Submit",
        href: "",
        variant: REPLACEMENT_DEFAULTS.variant,
        image: imageDefaults,
      },
      render: (props: ButtonProps) => {
        return (
          <button className={variantClass(props.variant)} type="submit">
            <ButtonContent {...props} />
          </button>
        );
      },
    },
  },
};

export default Button;
