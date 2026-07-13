import type { ComponentConfig, ComponentData, Config, Slot, SlotComponent } from "@puckeditor/core";
import { usePuck } from "@puckeditor/core";
import type { CSSProperties, ReactNode } from "react";
import { Fragment } from "react";
import externalPuckConfig from "virtual:purplepanda/puck-config";
import { ItemContext } from "../data-binding.js";

export type CardCollectionItem = Record<string, unknown> & { id: string };

export type CardCollectionProps = {
  contentType: string;
  limit: number;
  columns: number;
  gap: number;
  cardTemplate: Slot;
  items?: CardCollectionItem[];
};

// Read lazily (inside resolveFields, below) rather than at module scope: this component is
// itself registered inside the host's virtual:purplepanda/puck-config, so a top-level read here
// would race that module's own initialization (CardCollection.js loads virtual:purplepanda/puck-config
// mid-evaluation of the host config that's still busy importing CardCollection to register it),
// throwing "Cannot access 'externalPuckConfig' before initialization". Reading it from inside a
// function body defers evaluation until well after both modules have finished loading.
function getContentTypeOptions() {
  return (externalPuckConfig?.contentTypes ?? []).map((contentType) => ({
    label: contentType.title,
    value: contentType.id,
  }));
}

// Re-implements what Puck's own Slot renderer does, minus everything that needs the editor
// (drag refs, selection, drop targets) — used to draw non-interactive preview copies of the
// card template while editing, since Puck only ever keeps one live/draggable instance per id.
function renderStatic(node: ComponentData, config: Config): ReactNode {
  const componentConfig = (config.components ?? {})[node.type as string];
  if (!componentConfig?.render) return null;

  const fields = componentConfig.fields ?? {};
  const nodeProps = node.props as Record<string, unknown>;
  const resolvedProps: Record<string, unknown> = { ...nodeProps };

  for (const [fieldName, field] of Object.entries(fields)) {
    if ((field as { type?: string }).type !== "slot") continue;

    const children = Array.isArray(nodeProps[fieldName]) ? (nodeProps[fieldName] as ComponentData[]) : [];
    resolvedProps[fieldName] = ({ style, className }: { style?: CSSProperties; className?: string } = {}) => (
      <div style={style} className={className}>
        {children.map((child) => (
          <Fragment key={(child.props as { id?: string }).id}>{renderStatic(child, config)}</Fragment>
        ))}
      </div>
    );
  }

  resolvedProps.id = nodeProps.id;
  resolvedProps.puck = {
    dragRef: null,
    isEditing: false,
    metadata: {},
    renderDropZone: () => null,
  };

  return componentConfig.render(resolvedProps as never);
}

type EditingViewProps = Omit<CardCollectionProps, "cardTemplate"> & { cardTemplate: SlotComponent; id: string };

// Editing mode: one real, fully-editable card (drag/select/etc. all work as normal) plus static,
// non-interactive preview copies of the remaining items so the author can see how the collection
// will actually repeat, without Puck getting confused by multiple DOM nodes claiming one id.
function EditingView({ contentType, columns, gap, cardTemplate: Content, items, id }: EditingViewProps) {
  const { config, getItemById } = usePuck();
  const resolvedItems = items ?? [];
  const node = getItemById(id);
  const templateNodes = (((node?.props as Record<string, unknown> | undefined)?.cardTemplate as ComponentData[]) ?? []);
  const previewItems = resolvedItems.slice(1);

  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: `${gap * 0.25}rem` }}>
      <ItemContext.Provider value={resolvedItems[0] ?? null}>
        <Content />
      </ItemContext.Provider>

      {previewItems.map((item, index) => (
        <div key={item.id ?? index} style={{ pointerEvents: "none", opacity: 0.85 }}>
          <ItemContext.Provider value={item}>
            {templateNodes.map((childNode) => (
              <Fragment key={(childNode.props as { id?: string }).id ?? index}>
                {renderStatic(childNode, config as Config)}
              </Fragment>
            ))}
          </ItemContext.Provider>
        </div>
      ))}

      {resolvedItems.length === 0 && (
        <div style={{ opacity: 0.6, fontStyle: "italic" }}>
          {contentType ? "No published items found for this content type yet." : "Select a content type to preview items."}
        </div>
      )}
    </div>
  );
}

const CardCollection: ComponentConfig<CardCollectionProps> = {
  label: "Card Collection",
  locations: ["page", "template"],
  fields: {
    contentType: {
      type: "select",
      label: "Content type",
      options: [{ label: "— select a content type —", value: "" }],
    },
    limit: {
      type: "number",
      label: "Number of items",
      min: 1,
      max: 100,
    },
    columns: {
      type: "number",
      label: "Columns",
      min: 1,
      max: 12,
    },
    gap: {
      type: "number",
      label: "Gap",
      min: 0,
    },
    cardTemplate: {
      type: "slot",
    },
  },
  defaultProps: {
    contentType: "",
    limit: 10,
    columns: 3,
    gap: 4,
    cardTemplate: [],
  },
  resolveFields: (_data, { fields }) => ({
    ...fields,
    contentType: {
      ...fields.contentType,
      type: "select",
      options: [{ label: "— select a content type —", value: "" }, ...getContentTypeOptions()],
    },
  }),
  data: async ({ contentType, limit }: CardCollectionProps) => {
    if (!import.meta.env.SSR || !contentType) return { items: [] };
    const { getTopContentItems } = await import("./CardCollection.server.js");
    return { items: await getTopContentItems(contentType, limit ?? 10) };
  },
  render: (props) => {
    const { contentType, columns, gap, cardTemplate: Content, items, id, puck } = props;
    const resolvedItems = items ?? [];

    if (puck.isEditing) {
      return <EditingView contentType={contentType} columns={columns} gap={gap} cardTemplate={Content} items={resolvedItems} id={id} limit={props.limit} />;
    }

    return (
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: `${gap * 0.25}rem` }}>
        {resolvedItems.map((item) => (
          <ItemContext.Provider key={item.id} value={item}>
            <Content />
          </ItemContext.Provider>
        ))}
      </div>
    );
  },
};

export default CardCollection;
