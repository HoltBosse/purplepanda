import type { APIRoute } from "astro";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "../db/db.js";
import { dagNodes, pages } from "../db/schema.js";
import externalPuckConfig from "virtual:purplepanda/puck-config";

function normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.replace(/^\/+|\/+$/g, '');
}

function getPagePath(page: { id: string; content: unknown }, pageById: Map<string, typeof page>, visited = new Set<string>()): string {
    if (visited.has(page.id)) return '';
    const content = page.content as any;
    const alias: string = content?.root?.props?.alias ?? '';
    const parentId: string = content?.root?.props?.parentPage ?? '';
    if (parentId && pageById.has(parentId)) {
        const parentPath = getPagePath(pageById.get(parentId)!, pageById, new Set([...visited, page.id]));
        return parentPath ? `${parentPath}/${alias}` : alias;
    }
    return alias;
}

export const GET: APIRoute = async ({ site, url }) => {
    const db = getDb();
    const config = externalPuckConfig ?? {};
    const origin = (site ?? url).origin;

    const latestPublish = db
        .select({
            entityId: dagNodes.entityId,
            lastmod: sql<Date>`max(${dagNodes.createdAt})`.as('lastmod'),
        })
        .from(dagNodes)
        .where(and(eq(dagNodes.entityType, 'page'), eq(dagNodes.nodeType, 'publish')))
        .groupBy(dagNodes.entityId)
        .as('latest_publish');

    const allPages = await db
        .select({
            id: pages.id,
            contentType: pages.contentType,
            content: pages.content,
            lastmod: latestPublish.lastmod,
        })
        .from(pages)
        .leftJoin(latestPublish, eq(pages.id, latestPublish.entityId))
        .where(eq(pages.state, 1));
    const pageById = new Map(allPages.map(p => [p.id, p]));

    const contentTypeBaseUrls = new Map(
        (config.contentTypes ?? [])
            .filter(ct => ct.baseUrl)
            .map(ct => [ct.id, normalizeBaseUrl(ct.baseUrl!)])
    );

    const entries = allPages
        .map(page => {
            let path: string | null;
            if (page.contentType) {
                const base = contentTypeBaseUrls.get(page.contentType);
                const alias: string = (page.content as any)?.root?.props?.alias ?? '';
                path = base && alias ? `${base}/${alias}` : null;
            } else {
                path = getPagePath(page, pageById);
            }
            return path ? { path, lastmod: page.lastmod as Date | null } : null;
        })
        .filter((entry): entry is { path: string; lastmod: Date | null } => entry !== null);

    const urls = entries
        .map(({ path, lastmod }) => {
            const lastmodTag = lastmod ? `\n    <lastmod>${new Date(lastmod).toISOString()}</lastmod>` : '';
            return `  <url>\n    <loc>${origin}/${path}</loc>${lastmodTag}\n  </url>`;
        })
        .join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;

    return new Response(xml, {
        status: 200,
        headers: {
            "Content-Type": "application/xml",
        },
    });
};
