import type { Config } from "@puckeditor/core";
import { createContext, createElement, type ReactElement, useContext } from "react";

// Attribute names shared by the server wrapper (below) and the client hydration runtime
// (injected in src/index.ts). Kept as constants so the two stay in lockstep.
export const ISLAND_NAME_ATTR = "data-puck-island";
export const ISLAND_PROPS_ATTR = "data-puck-props";

// Supplies a synchronous static-markup renderer (i.e. `renderToStaticMarkup`) to islands rendered
// beneath it. When set, each island renders its own isolated subtree to an HTML string instead of
// as a normal nested child of the page's component tree — see the IslandMarker comment below for
// why. Left unset (the default) for callers that render PageRenderer as a live, already-interactive
// client tree (e.g. HistoryView's revision-comparison panes), where inline rendering is correct and
// no static-markup renderer is available/needed. Deliberately not importing `react-dom/server`
// (or its type) here: this module is bundled client-side too (via that live-tree path), and
// `react-dom/server` is a server-only dependency — callers that need isolation supply the renderer
// themselves, from a module that's never bundled for the browser (see the `.astro` route files).
export const IslandRenderContext = createContext<((element: ReactElement) => string) | undefined>(undefined);

// Props Puck injects into every render that are either non-serializable or meaningless on the
// client, so they never make it into the hydration payload. `puck` in particular carries
// functions (dragRef, renderDropZone) and is only relevant while editing.
const STRIPPED_PROP_KEYS = new Set(["puck", "editMode", "dragRef"]);

function isReactElement(value: unknown): boolean {
  return typeof value === "object" && value !== null && "$$typeof" in (value as Record<string, unknown>);
}

// Serializes the props a component was rendered with into the JSON payload the client re-hydrates
// from. Anything that can't survive a JSON round-trip (functions, React elements, undefined,
// symbols) is dropped rather than throwing — a whole-component island is expected to take
// primitive/plain-object props, and this keeps a stray non-serializable prop from breaking the
// whole page.
function serializeIslandProps(props: Record<string, unknown>): string {
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (STRIPPED_PROP_KEYS.has(key)) continue;
    filtered[key] = value;
  }

  return JSON.stringify(filtered, (_key, value) => {
    if (typeof value === "function") return undefined;
    if (typeof value === "symbol") return undefined;
    if (isReactElement(value)) return undefined;
    return value;
  });
}

// Renders an island's marker element: the wrapping div carrying the component name and its
// serialized props, around the component's own output.
//
// The client hydration runtime (src/index.ts, hydrate-islands.ts) always hydrates a marker as its
// own isolated React root — `hydrateRoot(el, createElement(baseRender, props))`, nothing above it
// in the tree. `useId()` (called directly, or inside a library like Base UI for aria-* ids) derives
// its value from the calling component's position in the tree back to that tree's root, not from a
// global counter. So for that id to match between server and client, the server must render this
// same subtree in the same isolated shape — otherwise the SSR id reflects this component's real,
// deeper position in the full page tree while the client id reflects a lone root, and React flags a
// hydration mismatch (harmless in practice, but noisy and wasteful to reconcile).
//
// `IslandRenderContext` supplies that isolated renderer (`renderToStaticMarkup`) for callers that
// render PageRenderer as static HTML for later independent hydration. When it's absent (PageRenderer
// running as a live, already-interactive client tree, e.g. HistoryView), the marker instead nests
// the component inline as a normal React child — there's no separate hydration pass to match in that
// case, and the whole tree already renders and reconciles as one piece.
function IslandMarker({
  name,
  props,
  baseRender,
}: {
  name: string;
  props: Record<string, unknown>;
  baseRender: (props: any) => ReactElement;
}) {
  const renderIsolated = useContext(IslandRenderContext);
  const markerProps = { [ISLAND_NAME_ATTR]: name, [ISLAND_PROPS_ATTR]: serializeIslandProps(props) };

  if (renderIsolated) {
    const html = renderIsolated(createElement(baseRender, props));
    return (
      // biome-ignore lint/security/noDangerouslySetInnerHtml: html comes from renderIsolated (renderToStaticMarkup on this same element, see IslandRenderContext), not raw user input — it's how the marker's SSR output is kept in the same isolated tree shape the client will hydrate against.
      <div {...markerProps} style={{ display: "contents" }} dangerouslySetInnerHTML={{ __html: html }} />
    );
  }

  return (
    <div {...markerProps} style={{ display: "contents" }}>
      {baseRender(props as never)}
    </div>
  );
}

// Wraps every component flagged `island: true` so that, on the published front end, its rendered
// output is enclosed in a marker element carrying the component name and a serialized snapshot of
// its props. The client runtime finds these markers and calls `hydrateRoot` with the same
// component's `render`, turning the whole component into an interactive React island while the
// surrounding page stays static HTML.
//
// This must be applied *inside* wrapConfigWithDataBinding (i.e. to the raw config, before data
// binding wraps it): that way the props captured in the marker are the already-resolved values a
// component receives at render time — including per-item values when the island is nested inside a
// CardCollection's card template — rather than the pre-resolution props with `bind_*` fields.
//
// In the editor (`puck.isEditing`) no marker is emitted and the component renders normally, so the
// live editor preview is never double-mounted by the hydration runtime.
export function wrapConfigWithIslands(config: Config): Config {
  const wrappedComponents: Config["components"] = {};

  for (const [name, componentConfig] of Object.entries(config.components ?? {})) {
    const isIsland = (componentConfig as { island?: boolean }).island === true;
    if (!isIsland) {
      wrappedComponents[name] = componentConfig;
      continue;
    }

    const baseRender = componentConfig.render;
    wrappedComponents[name] = {
      ...componentConfig,
      render: (props: Record<string, unknown>) => {
        const puck = props.puck as { isEditing?: boolean } | undefined;
        if (puck?.isEditing) {
          return baseRender(props as never);
        }

        return createElement(IslandMarker, { name, props, baseRender: baseRender as never });
      },
    };
  }

  return {
    ...config,
    components: wrappedComponents,
  };
}
