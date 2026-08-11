import type { Config } from "@puckeditor/core";

export type FieldOption = { label: string; value: string };

// Walks a form's *resolved* Puck content tree (see resolveDataForSSR — this must run first so a
// field's dynamic options, e.g. Select's content/users/tags source, are populated rather than
// whatever stale manual-mode leftover happens to be stored) to find each field's display label,
// its choice options (Select, RadioGroup) or checkbox label, and which field keys opt out of
// display entirely via `submissionDisplay: false` on their component config (e.g. Turnstile,
// whose stored value is a verification token rather than a meaningful answer).
export interface SubmissionFieldMeta {
  labelByFieldName: Record<string, string>;
  optionsByFieldName: Record<string, FieldOption[]>;
  checkboxLabelByFieldName: Record<string, string>;
  hiddenFieldNames: Set<string>;
  // Which component owns each field (and its stored props), so a component that implements
  // `renderSubmissionValue` (see puck/index.ts) can be looked up and run per field — kept
  // generic so any future field type can opt into custom rendering the same way, not just Image.
  typeByFieldName: Record<string, string>;
  propsByFieldName: Record<string, Record<string, unknown>>;
  // Fields whose component defines `renderSubmissionValue` (currently just Image, which renders
  // a thumbnail linking to /image/<id>) — that URL only loads for an admin browsing from the
  // submissions/media admin views (see /image/[id].ts's referer+session bypass check), so a
  // plain-text context like the notification email can't use it and links to the submission
  // itself instead (see formatSubmissionValue's submissionUrl param).
  customRenderFieldNames: Set<string>;
}

export function collectSubmissionFieldMeta(config: Config, resolvedFormContent: unknown): SubmissionFieldMeta {
  const meta: SubmissionFieldMeta = {
    labelByFieldName: {},
    optionsByFieldName: {},
    checkboxLabelByFieldName: {},
    hiddenFieldNames: new Set(),
    typeByFieldName: {},
    propsByFieldName: {},
    customRenderFieldNames: new Set(),
  };

  function collect(node: unknown): void {
    if (Array.isArray(node)) {
      node.forEach(collect);
      return;
    }
    if (!node || typeof node !== "object") return;

    const type = (node as any).type;
    const props = (node as any).props;
    if (props && typeof props.id === "string") {
      const fieldName = `field-${props.id}`;
      if (typeof props.label === "string" && props.label) {
        meta.labelByFieldName[fieldName] = props.label;
      }
      if (Array.isArray(props.options)) {
        meta.optionsByFieldName[fieldName] = props.options;
      } else if (typeof props.checkboxLabel === "string") {
        meta.checkboxLabelByFieldName[fieldName] = props.checkboxLabel;
      }
      if (typeof type === "string") {
        meta.typeByFieldName[fieldName] = type;
        meta.propsByFieldName[fieldName] = props;
        if (config.components?.[type]?.submissionDisplay === false) {
          meta.hiddenFieldNames.add(fieldName);
        }
        if (typeof config.components?.[type]?.renderSubmissionValue === "function") {
          meta.customRenderFieldNames.add(fieldName);
        }
      }
    }

    Object.values(node).forEach(collect);
  }

  collect(resolvedFormContent);
  return meta;
}

export function resolveFieldLabel(meta: SubmissionFieldMeta, key: string): string {
  return meta.labelByFieldName[key] ?? key;
}

function isFileValue(value: unknown): value is { name: string; size: number; type: string } {
  return !!value && typeof value === "object" && "name" in value && "size" in value && "type" in value;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function resolveDisplayValue(meta: SubmissionFieldMeta, key: string, raw: unknown): string {
  if (meta.checkboxLabelByFieldName[key] !== undefined) return meta.checkboxLabelByFieldName[key];
  const options = meta.optionsByFieldName[key];
  if (options) return options.find((opt) => opt.value === raw)?.label ?? String(raw ?? "");
  return String(raw ?? "");
}

// `submissionUrl`, when given, is used for fields whose component only knows how to render its
// value as HTML (see customRenderFieldNames above) — a plain-text caller can't reuse that HTML, so
// it links to the submission instead of printing the raw value (which for e.g. Image's
// `{id, title, alt}` media reference would otherwise just print "[object Object]").
export function formatSubmissionValue(
  meta: SubmissionFieldMeta,
  key: string,
  value: unknown,
  submissionUrl?: string,
): string {
  if (Array.isArray(value)) {
    return value.map((v) => formatSubmissionValue(meta, key, v, submissionUrl)).join(", ");
  }
  if (meta.customRenderFieldNames.has(key) && value) {
    return submissionUrl ? `View in submission: ${submissionUrl}` : "(see full submission)";
  }
  if (isFileValue(value)) return `${value.name} (${value.type || "unknown type"}, ${formatBytes(value.size)})`;
  return resolveDisplayValue(meta, key, value);
}

// Drops fields whose component opted out of display (e.g. Turnstile) — the same fields both the
// admin submissions table and the submit-notification email should never show.
export function visibleSubmissionFields(
  meta: SubmissionFieldMeta,
  data: Record<string, unknown>,
): [string, unknown][] {
  return Object.entries(data).filter(([key]) => !meta.hiddenFieldNames.has(key));
}
