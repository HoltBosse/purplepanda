import type { Config } from "@puckeditor/core";

// Attribute names shared by the server wrapper (below) and the client hydration runtime
// (injected in src/index.ts). Kept as constants so the two stay in lockstep.
export const ISLAND_NAME_ATTR = "data-puck-island";
export const ISLAND_PROPS_ATTR = "data-puck-props";

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

        return (
          <div
            {...{ [ISLAND_NAME_ATTR]: name, [ISLAND_PROPS_ATTR]: serializeIslandProps(props) }}
            style={{ display: "contents" }}
          >
            {baseRender(props as never)}
          </div>
        );
      },
    };
  }

  return {
    ...config,
    components: wrappedComponents,
  };
}
