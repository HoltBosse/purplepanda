// Pure helpers for the TemplateSlot marker that tells PageRenderer where page content is injected
// into a template. Kept separate from PuckEditor.tsx so they carry none of the editor's React /
// Puck imports and can be exercised directly.
import type { Data } from "@puckeditor/core";

export const TEMPLATE_SLOT_TYPE = "TemplateSlot";
export const TEMPLATE_SLOT_FALLBACK_ID = "TemplateSlot-fallback";

/**
 * Deep-searches arbitrary Puck data for a TemplateSlot component. The marker can sit at any depth
 * — nested inside another component's slot (e.g. wrapped in Margin/Flex) — so this walks the whole
 * structure rather than only the top-level content array.
 */
export function hasTemplateSlot(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => hasTemplateSlot(item));
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;

    if (record.type === TEMPLATE_SLOT_TYPE) {
      return true;
    }

    return Object.values(record).some((item) => hasTemplateSlot(item));
  }

  return false;
}

/**
 * Guarantees a template has somewhere to inject page content. A template saved without a
 * TemplateSlot would silently swallow every page that uses it, so one is appended as a fallback.
 */
export function ensureTemplateSlot(data: Data): Data {
  if (hasTemplateSlot(data)) {
    return data;
  }

  return {
    ...data,
    content: [
      ...(data.content ?? []),
      { type: TEMPLATE_SLOT_TYPE, props: { id: TEMPLATE_SLOT_FALLBACK_ID } },
    ],
  };
}
