import { inArray } from "drizzle-orm";
import { createBulkHandler } from "../../../../bulk/index.js";
import { getDb } from "../../../../db/db.js";
import { forms } from "../../../../db/schema.js";
import { findFormEmbedUsage } from "../../../../puck/form/embed-usage.js";

// A form currently embedded in a page or template (via the "FormEmbed" Puck component) can't be
// unpublished/deleted out from under that embed.
async function findEmbeddedFormNames(ids: string[]): Promise<string[]> {
    const db = getDb();
    const embedRows = await findFormEmbedUsage(db, ids);
    if (embedRows.length === 0) return [];

    const embeddedFormIds = [...new Set(embedRows.map((r) => r.formId))];
    const embeddedForms = await db.select({ content: forms.content }).from(forms).where(inArray(forms.id, embeddedFormIds));
    return embeddedForms.map((f) => (f.content as any)?.root?.props?.name || "Untitled");
}

export const POST = createBulkHandler(forms, "/admin/forms", async (ids, action) => {
    const blocked = await findEmbeddedFormNames(ids);
    if (blocked.length === 0) return null;
    return `Can't ${action} ${blocked.join(", ")} — still embedded in a page or template. Remove the embed first.`;
});
