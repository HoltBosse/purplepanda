import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { settings } from './schema.js';

export async function resolveSiteName(
    db: NodePgDatabase<Record<string, unknown>>,
): Promise<string | undefined> {
    const [row] = await db.select().from(settings).where(eq(settings.key, 'site_name')).limit(1);
    return row?.value as string | undefined;
}

export function formatPageTitle(title: string, siteName: string | undefined): string {
    return siteName ? `${title} | ${siteName}` : title;
}
