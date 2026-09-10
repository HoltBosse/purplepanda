import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { getSetting } from './content-cache.js';

export interface FontSettings {
    headingFontLink: string | undefined;
    bodyFontLink: string | undefined;
}

export async function resolveFontSettings(
    db: NodePgDatabase<Record<string, unknown>>,
): Promise<FontSettings> {
    const [headingFontLink, bodyFontLink] = await Promise.all([
        getSetting(db, 'heading_font_link'),
        getSetting(db, 'body_font_link'),
    ]);

    return {
        headingFontLink: headingFontLink as string | undefined,
        bodyFontLink: bodyFontLink as string | undefined,
    };
}
