import { inArray } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { settings } from './schema.js';

export interface FontSettings {
    headingFontLink: string | undefined;
    bodyFontLink: string | undefined;
}

export async function resolveFontSettings(
    db: NodePgDatabase<Record<string, unknown>>,
): Promise<FontSettings> {
    const rows = await db
        .select()
        .from(settings)
        .where(inArray(settings.key, ['heading_font_link', 'body_font_link']));

    return {
        headingFontLink: rows.find((row) => row.key === 'heading_font_link')?.value as string | undefined,
        bodyFontLink: rows.find((row) => row.key === 'body_font_link')?.value as string | undefined,
    };
}
