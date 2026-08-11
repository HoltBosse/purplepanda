import externalPuckConfig from "virtual:purplepanda/puck-config";
import type { ComponentConfig, ComponentData, Config, CustomField, Field, ObjectField, Slot, SlotComponent } from "@puckeditor/core";
import { createUsePuck } from "@puckeditor/core";
import type { CSSProperties, ReactNode } from "react";
import { Fragment, useState } from "react";
import { ItemContext } from "../data-binding.js";
import { Monitor, Smartphone, Tablet } from "../icons.js";
import {
  buildGridLayout,
  DEFAULT_LAYOUT,
  type GridLayout,
  type ResponsiveLayout,
} from "./card-grid.js";

const useTypedPuck = createUsePuck();

export type CardCollectionItem = Record<string, unknown> & { id: string };

export type { GridLayout, ResponsiveLayout } from "./card-grid.js";

export type OrderDirection = "asc" | "desc";

export type OrderBy = { field: string; direction: OrderDirection };

export type CardCollectionProps = {
  contentType: string;
  limit: number;
  offset: number;
  layout: ResponsiveLayout;
  orderBy: OrderBy;
  cardTemplate: Slot;
  items?: CardCollectionItem[];
};

const DEFAULT_ORDER_BY: OrderBy = { field: "", direction: "desc" };

type Breakpoint = "desktop" | "tablet" | "mobile";

const BREAKPOINT_TABS: { key: Breakpoint; label: string; icon: typeof Monitor }[] = [
  { key: "desktop", label: "Desktop", icon: Monitor },
  { key: "tablet", label: "Tablet", icon: Tablet },
  { key: "mobile", label: "Mobile", icon: Smartphone },
];

// Custom field UI: desktop/tablet/mobile tabs (icons only), each showing a Columns + Gap pair
// for that breakpoint. Desktop opens by default. Editing desktop also live-updates whichever of
// tablet/mobile hasn't been customized yet; editing tablet or mobile directly marks it customized
// so it stops following desktop.
function ResponsiveLayoutField({ value, onChange }: { value: ResponsiveLayout | undefined; onChange: (value: ResponsiveLayout) => void }) {
  const [active, setActive] = useState<Breakpoint>("desktop");
  const resolvedValue = value ?? DEFAULT_LAYOUT;
  const current = resolvedValue[active];

  const updateBreakpoint = (grid: GridLayout) => {
    if (active === "desktop") {
      onChange({
        ...resolvedValue,
        desktop: grid,
        tablet: resolvedValue.tabletCustomized ? resolvedValue.tablet : grid,
        mobile: resolvedValue.mobileCustomized ? resolvedValue.mobile : grid,
      });
      return;
    }

    onChange({
      ...resolvedValue,
      [active]: grid,
      ...(active === "tablet" ? { tabletCustomized: true } : { mobileCustomized: true }),
    });
  };

  return (
    <div>
      <div className="tabs tabs-box tabs-sm mb-2" role="tablist">
        {BREAKPOINT_TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-label={label}
            title={label}
            className={`tab ${active === key ? "tab-active" : ""}`}
            onClick={() => setActive(key)}
          >
            <Icon className="size-4" />
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs text-base-content/60">Columns</span>
          <input
            type="number"
            className="input input-bordered input-sm w-full"
            min={1}
            max={12}
            value={current.columns}
            onChange={(e) => updateBreakpoint({ ...current, columns: Number(e.target.value) })}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs text-base-content/60">Gap</span>
          <input
            type="number"
            className="input input-bordered input-sm w-full"
            min={0}
            value={current.gap}
            onChange={(e) => updateBreakpoint({ ...current, gap: Number(e.target.value) })}
          />
        </label>
      </div>
    </div>
  );
}

const layoutField: CustomField<ResponsiveLayout> = {
  type: "custom",
  label: "Layout",
  render: ({ value, onChange }) => <ResponsiveLayoutField value={value} onChange={onChange} />,
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

// Options for the "sort by field" select: the fields declared on whichever content type is
// currently selected, so authors can only pick a field that actually exists on the items.
function getSortableFieldOptions(contentTypeId: string) {
  const contentType = (externalPuckConfig?.contentTypes ?? []).find((ct) => ct.id === contentTypeId);
  return Object.entries(contentType?.fields ?? {}).map(([fieldName, field]) => ({
    label: (field as Field).label || fieldName,
    value: fieldName,
  }));
}

// Re-implements what Puck's own Slot renderer does, minus everything that needs the editor
// (drag refs, selection, drop targets) — used to draw non-interactive preview copies of the
// card template while editing, since Puck only ever keeps one live/draggable instance per id.
function renderStatic(node: ComponentData, config: Config): ReactNode {
  const componentConfig = config.components?.[node.type as string];
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
function EditingView({ contentType, layout, cardTemplate: Content, items, id }: EditingViewProps) {
  const config = useTypedPuck((state) => state.config);
  const getItemById = useTypedPuck((state) => state.getItemById);
  const resolvedItems = items ?? [];
  const node = getItemById(id);
  const templateNodes = (((node?.props as Record<string, unknown> | undefined)?.cardTemplate as ComponentData[]) ?? []);
  const previewItems = resolvedItems.slice(1);
  const { className, styleTag, style } = buildGridLayout(id, layout);

  return (
    <>
      {styleTag}
      <div className={className} style={style}>
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
    </>
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
    offset: {
      type: "number",
      label: "Offset",
      min: 0,
    },
    layout: layoutField,
    orderBy: {
      type: "object",
      label: "Order by",
      objectFields: {
        field: {
          type: "select",
          label: "Field",
          options: [{ label: "— date added —", value: "" }],
        },
        direction: {
          type: "select",
          label: "Direction",
          options: [
            { label: "Ascending", value: "asc" },
            { label: "Descending", value: "desc" },
          ],
        },
      },
    } as ObjectField<OrderBy>,
    cardTemplate: {
      type: "slot",
      label: "Card Template",
    },
  },
  defaultProps: {
    contentType: "",
    limit: 10,
    offset: 0,
    layout: DEFAULT_LAYOUT,
    orderBy: DEFAULT_ORDER_BY,
    cardTemplate: [],
  },
  resolveFields: (data, { fields }) => {
    const orderByField = fields.orderBy as ObjectField<OrderBy>;
    return {
      ...fields,
      contentType: {
        ...fields.contentType,
        type: "select",
        options: [{ label: "— select a content type —", value: "" }, ...getContentTypeOptions()],
      },
      orderBy: {
        ...orderByField,
        objectFields: {
          ...orderByField.objectFields,
          field: {
            ...orderByField.objectFields.field,
            type: "select",
            options: [{ label: "— date added —", value: "" }, ...getSortableFieldOptions(data.props.contentType)],
          },
        },
      } as ObjectField<OrderBy>,
    };
  },
  data: async ({ contentType, limit, offset, orderBy }: CardCollectionProps) => {
    if (!import.meta.env.SSR || !contentType) return { items: [] };
    const { getTopContentItems } = await import("./CardCollection.server.js");
    return { items: await getTopContentItems(contentType, limit ?? 10, orderBy, offset) };
  },
  render: (props) => {
    const { contentType, layout, orderBy, offset, cardTemplate: Content, items, id, puck } = props;
    const resolvedItems = items ?? [];

    if (puck.isEditing) {
      return (
        <EditingView
          contentType={contentType}
          layout={layout}
          orderBy={orderBy}
          offset={offset}
          cardTemplate={Content}
          items={resolvedItems}
          id={id}
          limit={props.limit}
        />
      );
    }

    const { className, styleTag, style } = buildGridLayout(id, layout);

    return (
      <>
        {styleTag}
        <div className={className} style={style}>
          {resolvedItems.map((item) => (
            <ItemContext.Provider key={item.id} value={item}>
              <Content />
            </ItemContext.Provider>
          ))}
        </div>
      </>
    );
  },
};

export default CardCollection;
