import type { ComponentConfig } from "@puckeditor/core";

export type ButtonProps = {
  children: string;
  href: string;
};

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
  },
  defaultProps: {
    children: "Button",
    href: "",
  },
  render: ({ children, href }) => {
    return <a className="btn btn-primary" href={href || undefined}>{children}</a>;
  },
  locationOverrides: {
    form: {
      fields: {
        children: {
          type: "text",
          label: "Label",
        },
      },
      defaultProps: {
        children: "Submit",
        href: "",
      },
      render: ({ children }: ButtonProps) => {
        return <button className="btn btn-primary" type="submit">{children}</button>;
      },
    },
  },
};

export default Button;
