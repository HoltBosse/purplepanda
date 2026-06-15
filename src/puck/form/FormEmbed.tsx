import type { ComponentConfig } from "@puckeditor/core";

export type FormRef = { id: string; name: string };

export type FormEmbedProps = {
  form: FormRef | null;
  _html?: string;
};

const FormEmbed: ComponentConfig<FormEmbedProps> = {
  label: "Form",
  locations: ["page", "template"],
  fields: {
    form: {
      type: "external",
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
      return <div dangerouslySetInnerHTML={{ __html: _html }} />;
    }
    return (
      <div
        style={{
          border: "2px dashed #d1d5db",
          borderRadius: "0.5rem",
          padding: "1.5rem",
          textAlign: "center",
          color: "#6b7280",
          backgroundColor: "#f9fafb",
        }}
      >
        {form?.name ? `Form: ${form.name}` : "No form selected"}
      </div>
    );
  },
};

export default FormEmbed;
