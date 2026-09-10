import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { getTemplateById, getTemplateForSettingsKey } from './content-cache.js';

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
        const template = await getTemplateById(db, pageTemplate.templateId);
        return template && template.state === 1 ? { templates: template } : undefined;
    }

    if (contentTypeId) {
        const contentTemplate = await getTemplateForSettingsKey(db, `content_default_template_${contentTypeId}`);
        if (contentTemplate) return { templates: contentTemplate };
    }

    const defaultTemplate = await getTemplateForSettingsKey(db, 'default_template');
    return defaultTemplate ? { templates: defaultTemplate } : undefined;
}
