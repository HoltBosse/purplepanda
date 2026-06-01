import { Puck } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import "../styles/puck-theme.css";
import type { Config, Data, Overrides } from "@puckeditor/core";
import { cloneElement, isValidElement, useEffect } from "react";
import externalPuckConfig from "virtual:purplepanda/puck-config";
import { wrapConfigWithClientDataResolvers } from "../puck/client-data-wrapper.js";

const baseConfig: Config = {
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

const hostConfig: Partial<Config> = externalPuckConfig ?? {};

const mergedConfig: Config = {
  ...baseConfig,
  ...hostConfig,
  components: {
    ...baseConfig.components,
    ...(hostConfig.components ?? {}),
  },
};

const config = wrapConfigWithClientDataResolvers(mergedConfig);

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
  return (
    <div style={{ position: "relative" }}>
      <a
        href="/admin"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "67px",
          height: "67px",
        }}
      >
        <img src="/admin/assets/favicon.svg" alt="Admin" style={{ height: "28px", width: "28px" }} />
      </a>
      <Puck config={config} data={initialData} onPublish={save} overrides={overrides} />
    </div>
  );
}
