import { sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

export type FormEmbedUsageRow = {
    hrefBase: "/admin/pages/edit" | "/admin/templates/edit";
    entityId: string;
    title: string;
    formId: string;
};

// Finds every place (page or template) that embeds one of the given forms via the "FormEmbed"
// Puck component (see ./FormEmbed.tsx). A FormEmbed can sit at any nesting depth inside another
// component's slot (e.g. a Grid/Flex column), so this pushes a recursive `jsonb_path_query` walk
// into Postgres rather than pulling every page's/template's full content tree into Node to walk
// by hand — see admin/forms/index.astro for the cost that avoids.
export async function findFormEmbedUsage(
    db: NodePgDatabase<Record<string, unknown>>,
    formIds: string[],
): Promise<FormEmbedUsageRow[]> {
    if (formIds.length === 0) return [];

    const idsArray = sql`ARRAY[${sql.join(formIds.map((id) => sql`${id}`), sql`, `)}]::text[]`;

    const { rows } = await db.execute<{ href_base: string; entity_id: string; title: string; form_id: string }>(sql`
        SELECT '/admin/pages/edit' AS href_base, p.id AS entity_id, (p.content -> 'root' -> 'props' ->> 'title') AS title, (jpq.form_id #>> '{}') AS form_id
        FROM pages p,
             jsonb_path_query(p.content, '$.** ? (@.type == "FormEmbed").props.form.id') AS jpq(form_id)
        WHERE (jpq.form_id #>> '{}') = ANY(${idsArray})
        UNION ALL
        SELECT '/admin/templates/edit' AS href_base, t.id AS entity_id, (t.content -> 'root' -> 'props' ->> 'title') AS title, (jpq.form_id #>> '{}') AS form_id
        FROM templates t,
             jsonb_path_query(t.content, '$.** ? (@.type == "FormEmbed").props.form.id') AS jpq(form_id)
        WHERE (jpq.form_id #>> '{}') = ANY(${idsArray})
    `);

    return rows.map((r) => ({
        hrefBase: r.href_base as FormEmbedUsageRow["hrefBase"],
        entityId: r.entity_id,
        title: r.title || "Untitled",
        formId: r.form_id,
    }));
}
