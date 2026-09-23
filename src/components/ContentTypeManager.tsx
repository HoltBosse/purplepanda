import { useEffect, useMemo, useRef, useState } from "react";
import type { ContentTypeFieldDef, ContentTypeFieldKind, ContentTypeRecord } from "../puck/content-types.js";
import { CONTENT_TYPE_FIELD_KINDS, KINDS_WITH_OPTIONS, RESERVED_FIELD_NAMES } from "../puck/content-types.js";
import { JSON_LD_TYPE_SUGGESTIONS, propertiesForJsonLdType } from "../puck/jsonld-types.js";

// The "Content Types" section of /admin/settings: what exists, plus the builder for creating or
// editing one, and deleting one.
// Adding a content type means describing its fields and its structured data, both of which are
// lists an author grows a row at a time — so this is a React island rather than another section
// of the server-rendered settings form (src/form), which only renders a fixed set of fields.
//
// It posts as an ordinary form (to pages/admin/settings/content-types/{create,update/:id,
// delete/:id}) with the two list-shaped parts serialized into hidden inputs, so the success/error
// alerts and redirect work like every other admin form.

interface Props {
  contentTypes: ContentTypeRecord[];
  // How many items (of any state but deleted) each content type holds, keyed by id — shown when
  // confirming a delete, since that's what disappears along with it.
  itemCounts: Record<string, number>;
  // Where the create/update/delete endpoints live.
  actionBase: string;
}

type OptionRow = { label: string; value: string };
// `existing` marks a field loaded from a saved content type. Its name is what every item already
// stores its value under, so it's fixed: changing it would orphan that value on every item.
type FieldRow = { label: string; name: string; type: ContentTypeFieldKind; options: OptionRow[]; existing: boolean };
type MappingRow = { property: string; source: string };

// Root props every content item has regardless of its type — ContentPuckEditor supplies them —
// so they're mappable to a structured-data property alongside the type's own fields.
const BUILT_IN_SOURCE_FIELDS = [
  { name: "title", label: "Title" },
  { name: "alias", label: "Alias" },
];

const inputClass = "input input-bordered input-sm w-full bg-base-100";
const selectClass = "select select-bordered select-sm w-full bg-base-100";

// Derives a field's prop name from its label ("Short description" -> "short_description"), which
// is what the author almost always wants — the name stays editable for when it isn't.
function toFieldName(label: string): string {
  const name = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[0-9]+/, "");
  return name;
}

function emptyField(): FieldRow {
  return { label: "", name: "", type: "text", options: [], existing: false };
}

// The builder's editable state for a saved content type — or a blank one to create from.
function formStateFor(record: ContentTypeRecord | null) {
  return {
    title: record?.title ?? "",
    baseUrl: record?.baseUrl ? `/${record.baseUrl.replace(/^\/+/, "")}` : "",
    fields: [
      ...(record?.fields ?? []).map((field) => ({
        label: field.label,
        name: field.name,
        type: field.type,
        options: field.options ?? [],
        existing: true,
      })),
      // Always one empty row to type a new field into; it's dropped on submit if left blank.
      emptyField(),
    ],
    jsonLdType: record?.jsonLd?.type ?? "",
    mappings: Object.entries(record?.jsonLd?.properties ?? {}).map(([property, source]) => ({ property, source })),
  };
}

// Whether an author has started filling a row in. A row that's still blank is dropped on submit
// rather than validated, so there's always an empty one to type into without it blocking the form.
function isStarted(field: FieldRow): boolean {
  return field.label.trim() !== "" || field.name.trim() !== "";
}

// Filters a field name down to what contentTypeInputSchema accepts as it's typed (or pasted), the
// same way AliasField does for a page's alias: a space becomes the word separator it reads as,
// anything else that can't appear in a prop name is dropped, and a name can't start with a
// non-letter. So an invalid name can't be entered in the first place.
function sanitizeFieldName(value: string): string {
  return value
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .replace(/^[^a-zA-Z]+/, "");
}

// Same idea for a base URL, which is a path prefix: spaces become hyphens (the separator a URL
// uses), anything that isn't path-safe is dropped, and repeated slashes collapse. Lowercased to
// match the aliases it gets joined to.
function sanitizeBaseUrl(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-_/]/g, "")
    .replace(/\/{2,}/g, "/");
}

// The browser's own constraint validation is wired to mirror contentTypeInputSchema
// (../puck/content-types.ts), so anything the sanitizers above can't fix — an empty required
// field, a reserved or duplicate name — blocks the submit button with a message on the offending
// input instead of coming back as an alert after a round trip. The patterns are the backstop for
// a value that reached the input without passing through its onChange (autofill, say). The server
// still validates everything; this is the same rules, enforced earlier.
const FIELD_NAME_PATTERN = "[a-zA-Z][a-zA-Z0-9_]*";
const FIELD_NAME_MESSAGE = "Field name must start with a letter and contain only letters, numbers and underscores";
// A base URL is a path prefix, so it's limited to what can appear in one.
const BASE_URL_PATTERN = "/?[a-zA-Z0-9\\-_]+(/[a-zA-Z0-9\\-_]+)*/?";
const BASE_URL_MESSAGE = "Base URL must be a path like /articles";

// Reports the rule an input broke. Skipped when the input is already carrying a message set
// elsewhere (customValidity below, e.g. a duplicate field name), which is the more specific one.
function validationMessage(message: string) {
  return {
    onInvalid: (event: { currentTarget: HTMLInputElement }) => {
      if (event.currentTarget.validity.customError) return;
      event.currentTarget.setCustomValidity(message);
    },
    onInput: (event: { currentTarget: HTMLInputElement }) => event.currentTarget.setCustomValidity(""),
  };
}

// For the rules a `pattern` can't express — a name another row already uses, or one the editor
// reserves. Applied as a ref so it re-runs on every render, i.e. after each keystroke clears it.
function customValidity(message: string) {
  return (node: HTMLInputElement | null) => {
    node?.setCustomValidity(message);
  };
}

export default function ContentTypeManager({ contentTypes, itemCounts, actionBase }: Props) {
  const [open, setOpen] = useState(false);
  // The saved content type being edited, or null while creating a new one.
  const [editing, setEditing] = useState<ContentTypeRecord | null>(null);
  const [title, setTitle] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [fields, setFields] = useState<FieldRow[]>([emptyField()]);
  const [jsonLdType, setJsonLdType] = useState("");
  const [mappings, setMappings] = useState<MappingRow[]>([]);
  const [deleting, setDeleting] = useState<ContentTypeRecord | null>(null);
  const deleteDialog = useRef<HTMLDialogElement>(null);

  // daisyUI's modal is a native <dialog>, which only goes modal through showModal() — so it's
  // driven from the `deleting` state rather than rendered conditionally.
  useEffect(() => {
    if (deleting) deleteDialog.current?.showModal();
    else deleteDialog.current?.close();
  }, [deleting]);

  function openBuilder(record: ContentTypeRecord | null) {
    const state = formStateFor(record);
    setEditing(record);
    setTitle(state.title);
    setBaseUrl(state.baseUrl);
    setFields(state.fields);
    setJsonLdType(state.jsonLdType);
    setMappings(state.mappings);
    setOpen(true);
  }

  // Only rows the author actually filled in are submitted — a blank trailing row (there's always
  // one to type into) isn't a field.
  const definedFields = useMemo<ContentTypeFieldDef[]>(
    () =>
      fields
        .filter((field) => field.label.trim() !== "")
        .map((field) => ({
          name: field.name.trim() || toFieldName(field.label),
          label: field.label.trim(),
          type: field.type,
          ...(KINDS_WITH_OPTIONS.includes(field.type)
            ? { options: field.options.filter((option) => option.label.trim() !== "") }
            : {}),
        })),
    [fields],
  );

  const serializedFields = useMemo(() => JSON.stringify(definedFields), [definedFields]);

  const serializedJsonLd = useMemo(() => {
    if (!jsonLdType) return "";
    const properties = Object.fromEntries(
      mappings
        .filter((mapping) => mapping.property.trim() !== "" && mapping.source !== "")
        .map((mapping) => [mapping.property.trim(), mapping.source]),
    );
    return JSON.stringify({ type: jsonLdType, properties });
  }, [jsonLdType, mappings]);

  const sourceOptions = useMemo(
    () => [...BUILT_IN_SOURCE_FIELDS, ...definedFields.map((field) => ({ name: field.name, label: field.label }))],
    [definedFields],
  );

  const duplicateNames = useMemo(() => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const field of definedFields) {
      if (seen.has(field.name)) duplicates.add(field.name);
      seen.add(field.name);
    }
    return duplicates;
  }, [definedFields]);

  // The properties of the chosen type a row can still be pointed at: its own included, everything
  // another row already maps left out — two rows mapping one property would mean the later one
  // silently winning when they're collapsed into the stored object.
  function availableProperties(own: string): string[] {
    const taken = new Set(mappings.map((mapping) => mapping.property).filter((property) => property !== own));
    return propertiesForJsonLdType(jsonLdType).filter((property) => !taken.has(property));
  }

  // The rules `pattern`/`required` can't express, reported on the name input itself.
  function nameProblem(field: FieldRow): string {
    const name = field.name.trim() || toFieldName(field.label);
    if (name === "") return "";
    if (RESERVED_FIELD_NAMES.includes(name)) return `"${name}" is a reserved field name`;
    if (duplicateNames.has(name)) return `Another field already uses the name "${name}"`;
    return "";
  }

  function updateField(index: number, patch: Partial<FieldRow>) {
    setFields((current) => current.map((field, i) => (i === index ? { ...field, ...patch } : field)));
  }

  function updateOption(fieldIndex: number, optionIndex: number, patch: Partial<OptionRow>) {
    setFields((current) =>
      current.map((field, i) =>
        i === fieldIndex
          ? { ...field, options: field.options.map((option, j) => (j === optionIndex ? { ...option, ...patch } : option)) }
          : field,
      ),
    );
  }

  // Deliberately bare: the card styling, the #content-types anchor and the settings-search hook sit
  // on the Astro wrapper in pages/admin/settings/index.astro — see why there.
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-medium settings-search-label">Content Types</h2>
        <button
          type="button"
          className={`btn btn-sm ${open ? "btn-error" : "btn-secondary"}`}
          onClick={() => (open ? setOpen(false) : openBuilder(null))}
        >
          {open ? "Cancel" : "New content type"}
        </button>
      </div>

      {contentTypes.length === 0 ? (
        <p className="mt-4 text-sm text-base-content/60">No content types yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th>Title</th>
                <th>Base URL</th>
                <th>Fields</th>
                <th>Structured data</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {contentTypes.map((contentType) => (
                <tr key={contentType.id}>
                  <td>
                    <a className="link link-hover font-medium" href={`/admin/content/${contentType.id}`}>
                      {contentType.title}
                    </a>
                  </td>
                  <td className="text-base-content/70">{contentType.baseUrl ? `/${contentType.baseUrl.replace(/^\/+/, "")}` : "—"}</td>
                  <td className="text-base-content/70">
                    {contentType.fields.length === 0 ? "—" : contentType.fields.map((field) => field.label).join(", ")}
                  </td>
                  <td className="text-base-content/70">{contentType.jsonLd?.type ?? "—"}</td>
                  <td className="text-right whitespace-nowrap">
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      aria-label={`Edit ${contentType.title}`}
                      onClick={() => openBuilder(contentType)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs text-error"
                      aria-label={`Delete ${contentType.title}`}
                      onClick={() => setDeleting(contentType)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <form
          // Remounted per content type, so the inputs' own validity state never carries over from
          // one to the next.
          key={editing?.id ?? "new"}
          method="POST"
          action={editing ? `${actionBase}/update/${editing.id}` : `${actionBase}/create`}
          className="mt-6 border-t border-base-300 pt-6 space-y-6"
        >
          <div>
            <h3 className="text-md font-semibold">{editing ? `Edit ${editing.title}` : "New content type"}</h3>
            {editing && (
              <p className="mt-1 text-xs text-base-content/60">
                A saved field's name can't change, since every item stores its value under it. Removing a field leaves
                that value on existing items, but it stops appearing in the editor. Changing the base URL moves where
                this type's items are published.
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
            <label className="text-md font-medium flex items-center settings-search-label" htmlFor="content-type-title">
              Title
            </label>
            <input
              id="content-type-title"
              name="title"
              type="text"
              required
              maxLength={255}
              className={inputClass}
              placeholder="Article"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              {...validationMessage("A title is required")}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
            <label className="text-md font-medium flex items-center settings-search-label" htmlFor="content-type-base-url">
              Base URL
              <span className="ml-2 text-xs font-normal text-base-content/60">
                items are published at {baseUrl ? `/${baseUrl.replace(/^\/+/, "")}` : "/…"}/{"{alias}"}
              </span>
            </label>
            <input
              id="content-type-base-url"
              name="baseUrl"
              type="text"
              maxLength={255}
              pattern={BASE_URL_PATTERN}
              className={inputClass}
              placeholder="/articles"
              value={baseUrl}
              onChange={(event) => setBaseUrl(sanitizeBaseUrl(event.target.value))}
              {...validationMessage(BASE_URL_MESSAGE)}
            />
          </div>

          <div>
            <h3 className="text-md font-medium settings-search-label">Fields</h3>
            <p className="mt-1 text-xs text-base-content/60">
              Every item also gets a title, alias, scheduling window, notes and Open Graph group, so these names are
              reserved: {RESERVED_FIELD_NAMES.join(", ")}.
            </p>

            <div className="mt-4 space-y-4">
              {fields.map((field, index) => (
                // The rows are positional and have no id of their own until they're saved, so the
                // index is the only stable key available here.
                // biome-ignore lint/suspicious/noArrayIndexKey: rows are identified by position
                <div key={index} className="rounded-md border border-base-300 p-4 space-y-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="grow min-w-40">
                      <span className="label-text text-xs">Label</span>
                      <input
                        type="text"
                        // A row left entirely blank is dropped rather than submitted, so it's only
                        // once something has been typed into one that the rest is required.
                        required={isStarted(field)}
                        aria-label={`Field ${index + 1} label`}
                        className={inputClass}
                        placeholder="Description"
                        value={field.label}
                        onChange={(event) => {
                          const label = event.target.value;
                          // Keep the name in step with the label until the author edits it
                          // themselves, at which point it stops being derived.
                          const derived = !field.existing && field.name === toFieldName(field.label);
                          updateField(index, { label, ...(derived ? { name: toFieldName(label) } : {}) });
                        }}
                        {...validationMessage("Field label is required")}
                      />
                    </div>
                    <div className="grow min-w-40">
                      <span className="label-text text-xs">Name</span>
                      <input
                        type="text"
                        required={isStarted(field)}
                        pattern={FIELD_NAME_PATTERN}
                        aria-label={`Field ${index + 1} name`}
                        disabled={field.existing}
                        title={field.existing ? "A saved field's name can't change" : undefined}
                        className={inputClass}
                        placeholder="description"
                        value={field.name}
                        onChange={(event) => updateField(index, { name: sanitizeFieldName(event.target.value) })}
                        ref={customValidity(nameProblem(field))}
                        {...validationMessage(FIELD_NAME_MESSAGE)}
                      />
                    </div>
                    <div className="grow min-w-32">
                      <span className="label-text text-xs">Type</span>
                      <select
                        aria-label={`Field ${index + 1} type`}
                        className={selectClass}
                        value={field.type}
                        onChange={(event) => {
                          const type = event.target.value as ContentTypeFieldKind;
                          updateField(index, {
                            type,
                            ...(KINDS_WITH_OPTIONS.includes(type) && field.options.length === 0
                              ? { options: [{ label: "", value: "" }] }
                              : {}),
                          });
                        }}
                      >
                        {CONTENT_TYPE_FIELD_KINDS.map((kind) => (
                          <option key={kind.kind} value={kind.kind}>
                            {kind.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setFields((current) => current.filter((_, i) => i !== index))}
                    >
                      Remove
                    </button>
                  </div>

                  {KINDS_WITH_OPTIONS.includes(field.type) && (
                    <div className="pl-4 border-l border-base-300 space-y-2">
                      <span className="label-text text-xs">Options</span>
                      {field.options.map((option, optionIndex) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: rows are identified by position
                        <div key={optionIndex} className="flex flex-wrap items-center gap-2">
                          <input
                            type="text"
                            // A select/radio field is only a field once it offers something to
                            // pick, so unlike a field row these can't be left half-filled.
                            required
                            aria-label={`Option ${optionIndex + 1} label`}
                            className={`${inputClass} max-w-48`}
                            placeholder="Label"
                            value={option.label}
                            onChange={(event) => {
                              const label = event.target.value;
                              const derived = option.value === toFieldName(option.label);
                              updateOption(index, optionIndex, {
                                label,
                                ...(derived ? { value: toFieldName(label) } : {}),
                              });
                            }}
                            {...validationMessage("Option label is required")}
                          />
                          <input
                            type="text"
                            required
                            aria-label={`Option ${optionIndex + 1} value`}
                            className={`${inputClass} max-w-48`}
                            placeholder="Value"
                            value={option.value}
                            onChange={(event) => updateOption(index, optionIndex, { value: event.target.value })}
                            {...validationMessage("Option value is required")}
                          />
                          <button
                            type="button"
                            className="btn btn-ghost btn-xs"
                            // The last one can't go: a select/radio field needs at least one
                            // option, which is the one rule left with nowhere to show a message.
                            disabled={field.options.length === 1}
                            onClick={() =>
                              updateField(index, { options: field.options.filter((_, j) => j !== optionIndex) })
                            }
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        className="btn btn-ghost btn-xs"
                        onClick={() => updateField(index, { options: [...field.options, { label: "", value: "" }] })}
                      >
                        Add option
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button
              type="button"
              className="btn btn-outline btn-sm mt-4"
              onClick={() => setFields((current) => [...current, emptyField()])}
            >
              Add field
            </button>
          </div>

          <div>
            <h3 className="text-md font-medium settings-search-label">Structured data (JSON-LD)</h3>
            <p className="mt-1 text-xs text-base-content/60">
              Pick the schema.org type these items are, then map its properties to the fields that supply them. Mapped
              properties with no value on an item are left out.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
              <label className="text-md font-medium flex items-center" htmlFor="content-type-jsonld-type">
                Type
              </label>
              <select
                id="content-type-jsonld-type"
                className={selectClass}
                value={jsonLdType}
                // The properties on offer belong to the chosen type, so the mappings made against
                // the previous one can't carry over.
                onChange={(event) => {
                  setJsonLdType(event.target.value);
                  setMappings([]);
                }}
              >
                <option value="">— none —</option>
                {JSON_LD_TYPE_SUGGESTIONS.map((suggestion) => (
                  <option key={suggestion.type} value={suggestion.type}>
                    {suggestion.type}
                  </option>
                ))}
              </select>
            </div>

            {jsonLdType !== "" && (
              <div className="mt-4 space-y-2">
                {mappings.map((mapping, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: rows are identified by position
                  <div key={index} className="flex flex-wrap items-center gap-2">
                    <select
                      // A mapping row is only added deliberately, so both halves are required —
                      // an empty one is a property that would silently never be published.
                      required
                      aria-label={`Structured data property ${index + 1}`}
                      className={`${selectClass} max-w-60`}
                      value={mapping.property}
                      onChange={(event) =>
                        setMappings((current) =>
                          current.map((row, i) => (i === index ? { ...row, property: event.target.value } : row)),
                        )
                      }
                    >
                      <option value="">— select a property —</option>
                      {availableProperties(mapping.property).map((property) => (
                        <option key={property} value={property}>
                          {property}
                        </option>
                      ))}
                    </select>
                    <span className="text-base-content/60">←</span>
                    <select
                      required
                      aria-label={`Structured data property ${index + 1} source`}
                      className={`${selectClass} max-w-60`}
                      value={mapping.source}
                      onChange={(event) =>
                        setMappings((current) =>
                          current.map((row, i) => (i === index ? { ...row, source: event.target.value } : row)),
                        )
                      }
                    >
                      <option value="">— select a field —</option>
                      {sourceOptions.map((option) => (
                        <option key={option.name} value={option.name}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-ghost btn-xs"
                      onClick={() => setMappings((current) => current.filter((_, i) => i !== index))}
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  // Every property of the type is already spoken for, so there's nothing a further
                  // row could map.
                  disabled={availableProperties("").length === 0}
                  onClick={() => setMappings((current) => [...current, { property: "", source: "" }])}
                >
                  Add property
                </button>
              </div>
            )}
          </div>

          <input type="hidden" name="fields" value={serializedFields} />
          <input type="hidden" name="jsonld" value={serializedJsonLd} />

          <div className="flex justify-end">
            <button type="submit" className="btn btn-accent btn-sm">
              {editing ? "Save changes" : "Create content type"}
            </button>
          </div>
        </form>
      )}

      <dialog ref={deleteDialog} className="modal" onClose={() => setDeleting(null)}>
        <div className="modal-box">
          <h3 className="text-lg font-semibold">Delete {deleting?.title}?</h3>
          <p className="mt-3 text-sm">
            {(() => {
              const count = deleting ? (itemCounts[deleting.id] ?? 0) : 0;
              return count === 0
                ? "No items will be removed."
                : `${count} ${count === 1 ? "item" : "items"} will be removed.`;
            })()}{""}
          </p>
          <div className="modal-action">
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setDeleting(null)}>
              Cancel
            </button>
            {deleting && (
              <form method="POST" action={`${actionBase}/delete/${deleting.id}`}>
                <button type="submit" className="btn btn-sm btn-error">
                  Delete
                </button>
              </form>
            )}
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button type="submit">close</button>
        </form>
      </dialog>
    </div>
  );
}
