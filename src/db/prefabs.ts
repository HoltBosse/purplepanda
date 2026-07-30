import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { settings } from './schema.js';

export function prefabSettingKey(contentTypeId?: string): string {
    return contentTypeId ? `content_default_prefab_${contentTypeId}` : 'default_prefab';
}

/**
 * Looks up the settings row holding a prefab's Puck data — the default prefab when no
 * content type is given, or that content type's prefab otherwise. Unlike templates, there's
 * no separate table and no fallback to the default: a content type's prefab is either saved
 * under its own key or doesn't exist yet.
 */
export async function resolvePrefabSetting(
    db: NodePgDatabase<Record<string, unknown>>,
    contentTypeId?: string,
) {
    const [row] = await db
        .select()
        .from(settings)
        .where(eq(settings.key, prefabSettingKey(contentTypeId)))
        .limit(1);

    return row;
}
