import type { ComponentConfig, Fields, Slot } from "@puckeditor/core";

const MAX_ITEMS = 8;
const DEFAULT_ITEMS = 3;

type SummaryKey = `summary${number}`;
type ContentKey = `content${number}`;

type AccordionProps = {
  itemCount: number;
  join: "yes" | "no";
} & Record<SummaryKey, Slot> &
  Record<ContentKey, Slot>;

function summaryKey(index: number): SummaryKey {
  return `summary${index}`;
}

function contentKey(index: number): ContentKey {
  return `content${index}`;
}

function clampItemCount(itemCount: number | undefined): number {
  return Math.min(Math.max(itemCount ?? DEFAULT_ITEMS, 1), MAX_ITEMS);
}

const itemCountField: Fields<AccordionProps>["itemCount"] = {
  type: "number",
  label: "Number of items",
  min: 1,
  max: MAX_ITEMS,
};

const joinField: Fields<AccordionProps>["join"] = {
  type: "radio",
  label: "Join items",
  options: [
    { label: "Yes", value: "yes" },
    { label: "No", value: "no" },
  ],
};

function buildDefaultProps(): AccordionProps {
  const defaults: Record<string, unknown> = { itemCount: DEFAULT_ITEMS, join: "no" };
  for (let i = 1; i <= MAX_ITEMS; i++) {
    defaults[summaryKey(i)] = [];
    defaults[contentKey(i)] = [];
  }
  return defaults as AccordionProps;
}

// Puck reads this static `fields` map (not `resolveFields`'s output) to decide which props are
// slots at render time — a prop only gets converted from raw slot data into a renderable slot
// component if it's declared here as `type: "slot"`. So every possible item's slots must be
// declared up front for MAX_ITEMS, even though `resolveFields` below only *shows* the ones up to
// the current `itemCount` in the properties panel.
const baseFields: Fields<AccordionProps> = { itemCount: itemCountField, join: joinField };
for (let i = 1; i <= MAX_ITEMS; i++) {
  baseFields[summaryKey(i)] = { type: "slot", label: `Item ${i} — Summary` };
  baseFields[contentKey(i)] = { type: "slot", label: `Item ${i} — Content` };
}

const Accordion: ComponentConfig<AccordionProps> = {
  label: "Accordion",
  fields: baseFields,
  defaultProps: buildDefaultProps(),
  resolveFields: (data) => {
    const itemCount = clampItemCount(data.props.itemCount);
    const fields: Fields<AccordionProps> = { itemCount: itemCountField, join: joinField };

    for (let i = 1; i <= itemCount; i++) {
      fields[summaryKey(i)] = baseFields[summaryKey(i)]!;
      fields[contentKey(i)] = baseFields[contentKey(i)]!;
    }

    return fields;
  },
  render: (props) => {
    const itemCount = clampItemCount(props.itemCount);
    const joined = props.join === "yes";
    // `props.id` is Puck's own randomly-generated identifier for this component instance —
    // already unique and stable across re-renders. Reusing it as the <details> `name` gives each
    // dropped accordion its own random group, so native only-one-open behavior works and separate
    // accordion instances on the same page never collapse each other's items.
    const groupName = `accordion-${props.id}`;
    const indexes = Array.from({ length: itemCount }, (_, i) => i + 1);

    return (
      <div className={joined ? "join join-vertical w-full" : "flex flex-col gap-2"}>
        {indexes.map((index) => {
          // Non-null: every index up to MAX_ITEMS always has a default (see buildDefaultProps),
          // so these are only `| undefined` in the type because of noUncheckedIndexedAccess.
          const Summary = props[summaryKey(index)]!;
          const Content = props[contentKey(index)]!;

          return (
            <details
              key={index}
              name={groupName}
              className={`collapse collapse-arrow bg-base-100 border border-base-200${joined ? " join-item" : ""}`}
            >
              <summary className="collapse-title font-semibold">
                <Summary />
              </summary>
              <Content className="collapse-content text-sm" />
            </details>
          );
        })}
      </div>
    );
  },
};

export default Accordion;
