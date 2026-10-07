import type { ComponentConfig, ComponentData, Config, ObjectField, Slot, SlotComponent } from "@puckeditor/core";
import { createUsePuck } from "@puckeditor/core";
import type { CSSProperties, ReactNode } from "react";
import { Fragment } from "react";
import * as z from "zod";
import type { BorderSide } from "../../theme/types.js";
import { DEFAULT_LAYOUT, layoutField, type ResponsiveLayout, responsiveLayoutSchema } from "../component-fields/LayoutField.js";
import { withoutIdleSides } from "../component-fields/ThemeFields.js";
import { getContentTypeRecords } from "../content-types.js";
import { ItemContext } from "../data-binding.js";
import { CardSurface, type CardSurfaceProps, cardSurfaceDefaults, cardSurfaceFields } from "./Card.js";
import { buildGridLayout } from "./card-grid.js";

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
  // "card" wraps each item in the site theme's card surface (see theme.card). Plain by default, so
  // collections saved before cards existed look the same in the editor (which fills in
  // defaultProps) and on the published page (which doesn't).
  cardStyle?: "plain" | "card" | undefined;
  // The cards' own scheme, or "" to take the surrounding one.
  scheme?: string | undefined;
  // The cards' own border preset, "none", or "" for the theme's card border; and its sides.
  border?: string | undefined;
  borderSides?: BorderSide[] | undefined;
  cardTemplate: Slot;
  items?: CardCollectionItem[];
};

// Wraps one rendered item in the theme's card surface when the collection asks for it.
type ItemSurfaceProps = Pick<CardCollectionProps, "cardStyle"> & CardSurfaceProps & { children: ReactNode };

function ItemSurface({ cardStyle, children, ...surface }: ItemSurfaceProps) {
  if (cardStyle !== "card") return <>{children}</>;
  return <CardSurface {...surface}>{children}</CardSurface>;
}

const DEFAULT_ORDER_BY: OrderBy = { field: "", direction: "desc" };

// The content types come from the database, reaching the browser as a global the admin layouts
// write before any island hydrates (see puck/content-types.ts) — so they're read inside
// resolveFields, at the moment the field is rendered, rather than captured at module scope.
function getContentTypeOptions() {
  return getContentTypeRecords().map((contentType) => ({
    label: contentType.title,
    value: contentType.id,
  }));
}

// Options for the "sort by field" select: the fields declared on whichever content type is
// currently selected, so authors can only pick a field that actually exists on the items.
function getSortableFieldOptions(contentTypeId: string) {
  const contentType = getContentTypeRecords().find((ct) => ct.id === contentTypeId);
  return (contentType?.fields ?? []).map((field) => ({
    label: field.label || field.name,
    value: field.name,
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

type EditingViewProps = Pick<CardCollectionProps, "contentType" | "layout" | "items"> & {
  cardTemplate: SlotComponent;
  id: string;
  surface: Omit<ItemSurfaceProps, "children">;
};

// Editing mode: one real, fully-editable card (drag/select/etc. all work as normal) plus static,
// non-interactive preview copies of the remaining items so the author can see how the collection
// will actually repeat, without Puck getting confused by multiple DOM nodes claiming one id.
function EditingView({ contentType, layout, cardTemplate: Content, items, id, surface }: EditingViewProps) {
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
          <ItemSurface {...surface}>
            <Content />
          </ItemSurface>
        </ItemContext.Provider>

        {previewItems.map((item, index) => (
          <div key={item.id ?? index} style={{ pointerEvents: "none", opacity: 0.85 }}>
            <ItemContext.Provider value={item}>
              <ItemSurface {...surface}>
                {templateNodes.map((childNode) => (
                  <Fragment key={(childNode.props as { id?: string }).id ?? index}>
                    {renderStatic(childNode, config as Config)}
                  </Fragment>
                ))}
              </ItemSurface>
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

// Mirrors the fields' own UI hints (contentType must be picked, limit is bounded 1-100, offset
// can't go negative), none of which Puck enforces server-side.
function toPropsSchema() {
  return z
    .object({
      contentType: z.string().min(1, "Select a content type"),
      limit: z.number().int().min(1).max(100),
      offset: z.number().int().min(0),
      layout: responsiveLayoutSchema,
    })
    .loose();
}

const CardCollection: ComponentConfig<CardCollectionProps> = {
  label: "Card Collection",
  locations: ["page", "template"],
  propsSchema: toPropsSchema,
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
    cardStyle: {
      type: "radio",
      label: "Item surface",
      options: [
        { label: "Plain", value: "plain" },
        { label: "Card", value: "card" },
      ],
    },
    ...cardSurfaceFields({ scheme: "Card color scheme", border: "Card border", borderSides: "Card border sides" }),
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
    cardStyle: "plain",
    ...cardSurfaceDefaults(),
    cardTemplate: [],
  },
  resolveFields: (data, { fields }) => {
    const orderByField = fields.orderBy as ObjectField<OrderBy>;
    return {
      ...withoutIdleSides(fields, data.props.border),
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
    const { contentType, layout, cardTemplate: Content, items, id, puck, cardStyle, scheme, border, borderSides } = props;
    const resolvedItems = items ?? [];
    const surface = { cardStyle, scheme, border, borderSides };

    if (puck.isEditing) {
      return <EditingView contentType={contentType} layout={layout} cardTemplate={Content} items={resolvedItems} id={id} surface={surface} />;
    }

    const { className, styleTag, style } = buildGridLayout(id, layout);

    return (
      <>
        {styleTag}
        <div className={className} style={style}>
          {resolvedItems.map((item) => (
            <ItemContext.Provider key={item.id} value={item}>
              <ItemSurface {...surface}>
                <Content />
              </ItemSurface>
            </ItemContext.Provider>
          ))}
        </div>
      </>
    );
  },
};

export default CardCollection;
