import type { Config } from "@puckeditor/core";

// The marker for where each page's content goes (see components/template-slot.ts). Not part of the
// site's Puck config — the template editor adds it the same way — so the AI assistants add it to a
// template's config themselves, to describe it in the catalog and find it in the document.
export function withTemplateSlot(config: Partial<Config>): Partial<Config> {
  return {
    ...config,
    components: { ...config.components, TemplateSlot: { label: "Page content (exactly one, required)", fields: {}, render: () => null } },
  } as unknown as Partial<Config>;
}
