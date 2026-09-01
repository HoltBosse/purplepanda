import { AutoField, type CustomField, type Field, FieldLabel } from "@puckeditor/core";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "../icons.js";

/**
 * CategoryObjectField
 * --------------------
 * Renders exactly like the core `object` field data-wise: the saved value is
 * a plain object built by spreading the previous value and patching the
 * changed key (identical to packages/core/components/AutoField/fields/ObjectField).
 * There is no schema saved alongside it — `objectFields` only exists in your
 * config, never in data.content[i].props.
 *
 * Visually, instead of a plain <fieldset>, it renders as a collapsible
 * section styled after the left-pane category drawer
 * (packages/core/components/ComponentList): an uppercase title button with a
 * chevron that toggles visibility of the sub-fields, using Puck's own CSS
 * custom properties so it matches the current theme.
 */

type ObjectFieldsShape = Record<string, Field>;

type CategoryObjectFieldRenderProps = {
  field: { label?: string; objectFields: ObjectFieldsShape; defaultExpanded?: boolean };
  value: Record<string, any> | undefined;
  onChange: (value: Record<string, any>) => void;
  name?: string;
  id?: string;
  readOnly?: boolean;
};

export const CategoryObjectField = ({
  field,
  value,
  onChange,
  readOnly,
}: CategoryObjectFieldRenderProps) => {
  const [expanded, setExpanded] = useState(field.defaultExpanded ?? true);
  const currentValue = value ?? {};
  const title = field.label ?? "Group";

  return (
    <div style={{ maxWidth: "100%" }}>
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((e) => !e)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--puck-space-1, 4px)",
          width: "100%",
          background: "transparent",
          border: 0,
          font: "inherit",
          fontSize: "var(--puck-font-size-xxxs, 11px)",
          textTransform: "uppercase",
          color: "var(--puck-color-text-muted, #6e6e6e)",
          padding: "var(--puck-space-2, 8px) 0",
          cursor: "pointer",
          borderRadius: "var(--puck-radius-m, 4px)",
        }}
      >
        <span>{title}</span>
        <span style={{ marginInlineStart: "auto" }}>
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </span>
      </button>

      {expanded && (
        <fieldset
          style={{
            border: 0,
            margin: 0,
            padding: 0,
            display: "grid",
            // A plain "1fr" track sizes to its content's min-width, which for something like
            // an unbroken long image filename is the full unwrapped text — overflowing the
            // sidebar. minmax(0, 1fr) lets the track (and everything truncating inside it, e.g.
            // ImageField's own `truncate` span) actually shrink to fit.
            gridTemplateColumns: "minmax(0, 1fr)",
            gap: 8,
          }}
          disabled={readOnly}
        >
          {Object.entries(field.objectFields).map(([subName, subField]) => {
            return (
              <FieldLabel key={subName} label={subField.label || subName}>
                <AutoField
                  field={subField}
                  value={currentValue[subName]}
                  onChange={(subValue) => {
                    // Same skip-if-unchanged + spread-and-patch merge as
                    // core's ObjectField onChange — keeps the saved shape
                    // a plain object with no trace of this field config.
                    if (currentValue[subName] === subValue) return;
                    onChange({ ...currentValue, [subName]: subValue });
                  }}
                  // Deliberately no `name` prop here: the public AutoField seeds its internal
                  // field-value store keyed by its own freshly-generated `id`, and a sub-field's
                  // displayed value is read back out of that store by `name` (falling back to
                  // `id` when unset) rather than from the `value` prop above. Passing a bare
                  // `name` (e.g. "title") would look the value up under that key instead of the
                  // id it was actually seeded under — so on every remount (e.g. selecting a
                  // different component and coming back) the field would look empty even though
                  // the real, saved value is still there.
                />
              </FieldLabel>
            );
          })}
        </fieldset>
      )}
    </div>
  );
};

/**
 * Usage in your component config — note `objectFields` lives alongside
 * `type: "custom"` as an extra config-only key, exactly like the real
 * `object` field. It's read by `render` below but never touches the data.
 */
export type CategoryField = CustomField<Record<string, any>> & {
  objectFields: ObjectFieldsShape;
  defaultExpanded?: boolean;
};

export const categoryField = (
  label: string,
  objectFields: ObjectFieldsShape,
  // Defaults to expanded, matching the core `object` field's fieldset (always visible, no
  // collapse control of its own) — pass false for a group that's secondary/optional enough
  // that it shouldn't compete for attention on load (e.g. Open Graph overrides).
  { defaultExpanded = true }: { defaultExpanded?: boolean } = {}
): CategoryField => ({
  type: "custom",
  label,
  objectFields,
  defaultExpanded,
  render: (props) => (
    <CategoryObjectField {...(props as any)} field={{ label, objectFields, defaultExpanded }} />
  ),
});

/* Example:
const config = {
  components: {
    Example: {
      fields: {
        seo: categoryField("SEO", {
          title: { type: "text" },
          description: { type: "textarea" },
        }, { defaultExpanded: false }),
      },
      render: ({ seo }) => <p>{seo?.title}</p>,
    },
  },
};
*/