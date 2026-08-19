import type { ComponentConfig } from "@puckeditor/core";
import { useEffect, useRef } from "react";
import * as z from "zod";
import { hydrateIslands } from "../hydrate-islands.js";

export type FormRef = { id: string; name: string };

export type FormEmbedProps = {
  form: FormRef | null;
  _html?: string;
};

// An unselected embed just renders a "No form selected" placeholder — meaningless once published.
function toPropsSchema() {
  return z
    .object({
      form: z.object({ id: z.string(), name: z.string() }, "Select a form"),
    })
    .loose();
}

// `_html` is a static markup string (see the comment on its dangerouslySetInnerHTML use below), so
// any island markers it contains (e.g. a Select field's SlimSelect enhancement) are inert unless
// something hydrates them explicitly. On a real page load the site-wide hydration runtime finds
// them; contexts that instead run PageRenderer as a live React tree (e.g. HistoryView's revision
// preview) skip that runtime, so this component hydrates its own markers itself once the HTML is
// in the DOM.
function FormHtml({ html }: { html: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    hydrateIslands(root);
  }, [html]);

  // biome-ignore lint/security/noDangerouslySetInnerHtml: html is server-rendered by FormEmbed.server.ts from the CMS's own admin-authored Puck form config via renderToStaticMarkup, not raw user input — this is the only way to embed that pre-rendered markup into the React tree
  return <div ref={containerRef} className="w-full" dangerouslySetInnerHTML={{ __html: html }} />;
}

const FormEmbed: ComponentConfig<FormEmbedProps> = {
  label: "Form",
  locations: ["page", "template"],
  propsSchema: toPropsSchema,
  fields: {
    form: {
      type: "external",
      label: "Form",
      placeholder: "Select a form...",
      showSearch: true,
      fetchList: async ({ query }: { query: string }) => {
        const params = query ? `?search=${encodeURIComponent(query)}` : "";
        const res = await fetch(`/admin/forms/api/lookup${params}`, { credentials: "same-origin" });
        if (!res.ok) return [];
        return res.json() as Promise<FormRef[]>;
      },
      mapRow: (item: FormRef) => ({ Name: item.name || item.id || "Untitled" }),
      getItemSummary: (item: FormRef | null) =>
        item?.name || item?.id || "Untitled",
    },
  },
  defaultProps: {
    form: null,
  },
  data: async ({ form }: FormEmbedProps) => {
    if (!import.meta.env.SSR || !form?.id) return {};
    const { getFormHtml } = await import("./FormEmbed.server.js");
    return { _html: await getFormHtml(form.id) };
  },
  render: ({ form, _html }: FormEmbedProps) => {
    if (_html) {
      // Explicit width, not left to shrink-to-fit: as a flex/grid item (e.g. inside a Flex
      // component) this div would otherwise size itself off whatever's biggest inside the form
      // markup. Before JS runs that's the native <select>'s own `w-full`, which happens to keep
      // this div stretched full-width too — but once an island (e.g. the Select field's SlimSelect
      // enhancement) clears that class on hydration, the div loses its only reason to stay wide
      // and collapses to fit-content, visibly shrinking the whole form.
      return <FormHtml html={_html} />;
    }
    // Styled as an error, not just a neutral placeholder, when no form is selected at all: this
    // prop is required (see propsSchema above), so that state can't actually be saved/published —
    // the red border/text flags it directly on the canvas, matching ImagePicker's placeholder.
    // A form that *is* selected but hasn't resolved its `_html` yet (still loading) keeps the
    // neutral styling, since that's not an error state.
    return (
      <div
        style={
          form
            ? {
                border: "2px dashed #d1d5db",
                borderRadius: "0.5rem",
                padding: "1.5rem",
                textAlign: "center",
                color: "#6b7280",
                backgroundColor: "#f9fafb",
              }
            : {
                border: "2px dashed var(--color-error)",
                borderRadius: "0.5rem",
                padding: "1.5rem",
                textAlign: "center",
                color: "var(--color-error)",
                backgroundColor: "color-mix(in srgb, var(--color-error) 10%, transparent)",
              }
        }
      >
        {form?.name ? `Form: ${form.name}` : "No form selected"}
      </div>
    );
  },
};

export default FormEmbed;
