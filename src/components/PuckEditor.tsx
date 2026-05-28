import { Puck } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import "../styles/puck-theme.css";
import type { Config, Data, Overrides } from "@puckeditor/core";
import { cloneElement, isValidElement, useEffect } from "react";

const config: Config = {
  components: {
    HeadingBlock: {
      fields: {
        children: {
          type: "text",
        },
      },
      render: ({ children }) => {
        return <h1>{children}</h1>;
      },
    },
  },
};

const initialData: Data = { content: [], root: { props: {} } };

const overrides: Partial<Overrides<Config>> = {
  headerActions: ({ children }) => {
    if (isValidElement(children)) {
      return cloneElement(children as any, { "data-puck-publish": "" });
    }

    return <>{children}</>;
  },

  iframe: ({ children, document }) => {
    useEffect(() => {
      if (document) {
        document.documentElement.setAttribute("data-theme", "false");
      }
    }, [document]);

    return <>{children}</>;
  },
};

const save = (data: Data) => {
  console.log("Saving data:", data);
};

export default function PuckEditor() {
  return <Puck config={config} data={initialData} onPublish={save} overrides={overrides} />;
}
