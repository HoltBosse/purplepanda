import { and, eq, inArray, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { settings, templates } from './schema.js';

/**
 * Resolves the template that applies for a given content type, falling back
 * to the site-wide default template when no content-type-specific one is set.
 *
 * `pageTemplate` lets a specific page override that resolution: `noTemplate: true`
 * skips templating entirely, and `templateId` pins a specific template — both take
 * priority over the content-type/site-wide settings lookup below.
 */
export async function resolveTemplateSetting(
    db: NodePgDatabase<Record<string, unknown>>,
    contentTypeId?: string,
    pageTemplate?: { templateId?: string | null; noTemplate?: boolean },
) {
    if (pageTemplate?.noTemplate) return undefined;

    if (pageTemplate?.templateId) {
        const [row] = await db
            .select()
            .from(templates)
            .where(and(eq(templates.id, pageTemplate.templateId), eq(templates.state, 1)))
            .limit(1);
        return row ? { templates: row } : undefined;
    }

    const keys = contentTypeId
        ? [`content_default_template_${contentTypeId}`, 'default_template']
        : ['default_template'];

    const rows = await db
        .select()
        .from(settings)
        .leftJoin(templates, sql`(${templates.id})::text = (${settings.value} #>> '{}')`)
        .where(inArray(settings.key, keys));

    if (contentTypeId) {
        const contentTemplate = rows.find(
            (row) => row.settings.key === `content_default_template_${contentTypeId}` && row.templates,
        );
        if (contentTemplate) return contentTemplate;
    }

    return rows.find((row) => row.settings.key === 'default_template' && row.templates);
}
