import { and, eq, inArray, like, or, sql } from "drizzle-orm";
import { createBulkHandler } from "../../../../bulk/index.js";
import { getDb } from "../../../../db/db.js";
import { settings, templates } from "../../../../db/schema.js";

// A template currently wired up as the site-wide "Pages" default or a content type's default
// (see admin/settings) can't be unpublished/deleted out from under whatever relies on it — same
// `settings` rows the settings page itself reads/writes (see db/templates.ts).
async function findDefaultTemplateNames(ids: string[]): Promise<string[]> {
    const db = getDb();
    const rows = await db
        .select({ title: sql<string>`${templates.content} -> 'root' -> 'props' ->> 'title'` })
        .from(templates)
        .innerJoin(settings, sql`(${settings.value} #>> '{}') = ${templates.id}::text`)
        .where(and(
            inArray(templates.id, ids),
            or(eq(settings.key, "default_template"), like(settings.key, "content_default_template_%")),
        ));

    return [...new Set(rows.map((r) => r.title || "Untitled"))];
}

export const POST = createBulkHandler(templates, "/admin/templates", async (ids, action) => {
    const blocked = await findDefaultTemplateNames(ids);
    if (blocked.length === 0) return null;
    return `Can't ${action} ${blocked.join(", ")} — still set as the default template for Pages or a content type. Change the default in Settings first.`;
});
