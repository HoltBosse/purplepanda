import externalPuckConfig from "virtual:purplepanda/puck-config";
import type { Config, Data } from "@puckeditor/core";
import { Render, walkTree } from "@puckeditor/core";
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

  // TemplateSlot marks where page content is injected. It can be nested inside another
  // component's slot (e.g. wrapped by Margin/Flex), so we splice it in wherever it appears
  // in the tree rather than only scanning the top-level content array.
  let injected = false;
  const mergedData = walkTree(templateData, renderConfig, (content) => {
    if (!content.some((item) => (item as any)?.type === "TemplateSlot")) return;
    injected = true;
    return content.flatMap((item) =>
      (item as any)?.type === "TemplateSlot" ? (pageData.content ?? []) : [item],
    );
  });

  if (!injected) {
    return (
      <>
        <Render config={renderConfig} data={templateData} />
        <Render config={renderConfig} data={pageData} />
      </>
    );
  }

  return <Render config={renderConfig} data={mergedData} />;
}
