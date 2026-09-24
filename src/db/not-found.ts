import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { settings } from './schema.js';

export const NOT_FOUND_SETTING_KEY = 'not_found_page';

/**
 * Looks up the settings row holding the custom 404 page's Puck data. Stored like a prefab — a
 * single settings row with its history in dag_nodes — and absent until first saved, in which
 * case 404.astro falls back to its built-in page.
 */
export async function resolveNotFoundSetting(db: NodePgDatabase<Record<string, unknown>>) {
    const [row] = await db
        .select()
        .from(settings)
        .where(eq(settings.key, NOT_FOUND_SETTING_KEY))
        .limit(1);

    return row;
}
