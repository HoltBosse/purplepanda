import { Puck } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import "../styles/puck-theme.css";
import type { Config, Data, Overrides, PuckContext } from "@puckeditor/core";
import { Render } from "@puckeditor/core";
import React, { cloneElement, isValidElement, useEffect, useMemo } from "react";

const ROOT_SLOT_NAME = "default-zone";

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
  templateData?: Data;
  onPublish: (data: Data) => void;
}

function hasTemplateSlot(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => hasTemplateSlot(item));
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;

    if (record.type === "TemplateSlot") {
      return true;
    }

    return Object.values(record).some((item) => hasTemplateSlot(item));
  }

  return false;
}

function ensureTemplateSlot(data: Data): Data {
  if (hasTemplateSlot(data)) {
    return data;
  }

  return {
    ...data,
    content: [...(data.content ?? []), { type: "TemplateSlot", props: { id: "TemplateSlot-fallback" } }],
  };
}

export default function PuckEditor({ config, data, templateData, onPublish }: PuckEditorProps) {
  const normalizedTemplateData = templateData ? ensureTemplateSlot(templateData) : undefined;
  const segments: Array<Data["content"] | "__SLOT__"> = [];

  if (normalizedTemplateData) {
    console.log("Using template data:", templateData);

    /* const rootRef = useRef<HTMLDivElement | null>(null); */
    const templateContent = normalizedTemplateData.content ?? [];
    let currentSegment: Data["content"] = [];

    for (const item of templateContent) {
      if ((item as Record<string, unknown>)?.type === "TemplateSlot") {
        if (currentSegment.length > 0) {
          segments.push(currentSegment);
        }
        segments.push("__SLOT__");
        currentSegment = [];
        continue;
      }

      currentSegment.push(item as any);
    }

    if (currentSegment.length > 0) {
      segments.push(currentSegment);
    }

    console.log("Segments:", segments);
  } else {
    //make sure we always have one slot if no template data is provided
    segments.push("__SLOT__");
  }

  let configCopy = useMemo(() => {
    const nextConfig = {
      ...config,
      root: {
        ...(config.root ?? {}),
      },
    };

    nextConfig.root = {
      ...(nextConfig.root ?? {}),
      render: ({
        puck: { renderDropZone },
      }: {
        puck: Pick<PuckContext, "renderDropZone">;
      }) => {
        return (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              minHeight: "100%",
              width: "100%",
              maxWidth: "100%",
              /* boxSizing: "border-box", */
              /* overflowX: "clip", */
            }}
          >
            {segments.map((segment, index) => {
              if (segment === "__SLOT__") {
                return (
                  <React.Fragment key={index}>
                    {renderDropZone({
                      zone: ROOT_SLOT_NAME,
                      style: {
                        flexGrow: 1,
                        minWidth: 0,
                        width: "100%",
                        maxWidth: "100%",
                        /* boxSizing: "border-box", */
                      },
                    })}
                  </React.Fragment>
                );
              } else {
                if (!normalizedTemplateData) {
                  return null;
                }

                return (
                  <Render
                    key={`segment-${index}`}
                    config={config}
                    data={{
                      ...normalizedTemplateData,
                      content: segment,
                    }}
                  />
                );
              }
            })}
          </div>
        );
      },
    };

    return nextConfig;
  }, [config]);

  return (
    <div style={{ position: "relative", width: "100%", maxWidth: "100%", overflowX: "clip" }}>
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
      <Puck config={configCopy} data={data} onPublish={onPublish} overrides={overrides} />
    </div>
  );
}
