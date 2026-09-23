import type { Config } from "@puckeditor/core";
import { ISLAND_NAME_ATTR, ISLAND_PROPS_ATTR } from "./islands.js";

// Re-hydrates any `[data-puck-island]` markers found within `root` into interactive React
// components. ./hydrate-page-islands.ts runs this over the whole document, and is loaded only by
// the pages that render PageRenderer as static HTML. Pages where PageRenderer instead runs inside
// a live React tree (e.g. HistoryView) leave it out, on the assumption that live React components
// are already interactive — true for a component rendered directly by that tree, but not for one
// whose markup instead arrives as an opaque `dangerouslySetInnerHTML` string (e.g. FormEmbed's
// server-rendered `_html`): React never looks inside that string, so any island markers nested in
// it are inert until something explicitly hydrates them. Callers with that shape should invoke
// this after committing the HTML.
export async function hydrateIslands(root: ParentNode): Promise<void> {
  const markers = root.querySelectorAll(`[${ISLAND_NAME_ATTR}]`);
  if (markers.length === 0) return;

  const [islandsModule, React, ReactDOMClient] = await Promise.all([
    import("virtual:purplepanda/islands"),
    import("react"),
    import("react-dom/client"),
  ]);

  const loaders = islandsModule.default ?? {};
  let fullConfig: Partial<Config> | null = null;
  const resolveComponent = async (name: string) => {
    const loader = loaders[name];
    if (loader) {
      try {
        return await loader();
      } catch {
        return null;
      }
    }
    if (!fullConfig) {
      const mod = await import("../puck.config.js");
      fullConfig = mod.default ?? {};
    }
    return fullConfig.components?.[name];
  };

  for (const el of Array.from(markers)) {
    const name = el.getAttribute(ISLAND_NAME_ATTR);
    if (!name) continue;

    const component = await resolveComponent(name);
    if (!component || typeof component.render !== "function") continue;

    let props: Record<string, unknown> = {};
    try {
      props = JSON.parse(el.getAttribute(ISLAND_PROPS_ATTR) || "{}");
    } catch {
      continue;
    }

    ReactDOMClient.hydrateRoot(el, React.createElement(component.render as never, props));
  }
}
