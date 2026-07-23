import type { Config, Data } from "@puckeditor/core";
import { Render } from "@puckeditor/core";
import externalPuckConfig from "virtual:purplepanda/puck-config";
import { wrapConfigWithDataBinding, wrapConfigWithIslands } from "../puck/index.js";

// Island wrapping is applied first (innermost) so the props captured in each island marker are the
// values a component actually renders with — including per-item values resolved by data binding
// when the island sits inside a CardCollection card.
const hostConfig: Partial<Config> = wrapConfigWithDataBinding(
  wrapConfigWithIslands((externalPuckConfig ?? {}) as Config),
);

const renderConfig: Config = {
  ...hostConfig,
  components: {
    TemplateSlot: { render: () => <></> },
    ...(hostConfig.components ?? {}),
  },
  root: {
    ...(hostConfig.root ?? {}),
    render: (props: any) => <>{props.children}</>,
  },
} as unknown as Config;

interface PageRendererProps {
  pageData: Data;
  templateData?: Data | undefined;
}

export default function PageRenderer({ pageData, templateData }: PageRendererProps) {
  if (!templateData) {
    return <Render config={renderConfig} data={pageData} />;
  }

  const templateContent = templateData.content ?? [];
  const segments: Array<Data["content"] | "__SLOT__"> = [];
  let current: Data["content"] = [];

  for (const item of templateContent) {
    if ((item as any)?.type === "TemplateSlot") {
      if (current.length > 0) segments.push([...current]);
      segments.push("__SLOT__");
      current = [];
    } else {
      current.push(item as any);
    }
  }
  if (current.length > 0) segments.push([...current]);
  if (!segments.includes("__SLOT__")) segments.push("__SLOT__");

  return (
    <>
      {segments.map((segment, index) => {
        if (segment === "__SLOT__") {
          return <Render key={`slot-${index}`} config={renderConfig} data={pageData} />;
        }
        return (
          <Render
            key={`segment-${index}`}
            config={renderConfig}
            data={{ ...templateData, content: segment as Data["content"] }}
          />
        );
      })}
    </>
  );
}
