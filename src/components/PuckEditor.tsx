import { Puck } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import "../styles/puck-theme.css";
import type { Config, Data, Overrides } from "@puckeditor/core";
import { cloneElement, isValidElement, useEffect } from "react";

export const overrides: Partial<Overrides<Config>> = {
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

interface PuckEditorProps {
  config: Config;
  data: Data;
  onPublish: (data: Data) => void;
}

export default function PuckEditor({ config, data, onPublish }: PuckEditorProps) {
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
      <Puck config={config} data={data} onPublish={onPublish} overrides={overrides} />
    </div>
  );
}
