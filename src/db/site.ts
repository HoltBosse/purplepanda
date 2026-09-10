import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { getSetting } from './content-cache.js';

export async function resolveSiteName(
    db: NodePgDatabase<Record<string, unknown>>,
): Promise<string | undefined> {
    return (await getSetting(db, 'site_name')) as string | undefined;
}

export function formatPageTitle(title: string, siteName: string | undefined): string {
    return siteName ? `${title} | ${siteName}` : title;
}
