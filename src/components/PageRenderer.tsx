import externalPuckConfig from "virtual:purplepanda/puck-config";
import type { Config, Data } from "@puckeditor/core";
import { Render, walkTree } from "@puckeditor/core";
import type { ReactElement } from "react";
import {
  IslandRenderContext,
  wrapConfigWithClientDataResolvers,
  wrapConfigWithDataBinding,
  wrapConfigWithIslands,
} from "../puck/index.js";

// Island wrapping is applied first (innermost) so the props captured in each island marker are the
// values a component actually renders with — including per-item values resolved by data binding
// when the island sits inside a CardCollection card. Client data resolvers go outermost: when
// PageRenderer runs as SSR (the published page, the admin preview routes), pageData already
// arrives pre-resolved via resolveDataForSSR, so the wrapper's fetch effect never fires (effects
// don't run during server rendering) and it's a pass-through. When PageRenderer instead runs live
// in the browser with unresolved DAG content (e.g. HistoryView's revision-comparison panes), this
// is what lets components like FormEmbed fetch their server-only data (`/admin/components/data`)
// instead of falling back to their SSR-only placeholder.
const hostConfig: Partial<Config> = wrapConfigWithClientDataResolvers(
  wrapConfigWithDataBinding(wrapConfigWithIslands((externalPuckConfig ?? {}) as Config)),
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
  // A synchronous static-markup renderer (i.e. `renderToStaticMarkup`), supplied by the
  // publish/preview routes that render this page as static HTML for later independent island
  // hydration — so each island's SSR output matches the isolated tree shape the client will
  // hydrate against (see IslandRenderContext in ../puck/islands.tsx). Left unset by callers that
  // render PageRenderer as a live, already-interactive client tree (e.g. HistoryView), where
  // islands should render inline instead. Not imported directly here: `react-dom/server` is
  // server-only, and this component is also bundled client-side via that live-tree path.
  renderIsolatedIsland?: (element: ReactElement) => string;
}

export default function PageRenderer({ pageData, templateData, renderIsolatedIsland }: PageRendererProps) {
  if (!templateData) {
    return (
      <IslandRenderContext.Provider value={renderIsolatedIsland}>
        <Render config={renderConfig} data={pageData} />
      </IslandRenderContext.Provider>
    );
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
      <IslandRenderContext.Provider value={renderIsolatedIsland}>
        <Render config={renderConfig} data={templateData} />
        <Render config={renderConfig} data={pageData} />
      </IslandRenderContext.Provider>
    );
  }

  return (
    <IslandRenderContext.Provider value={renderIsolatedIsland}>
      <Render config={renderConfig} data={mergedData} />
    </IslandRenderContext.Provider>
  );
}
