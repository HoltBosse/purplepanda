import { and, desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { dagNodes, settings, settingsKeyTarget } from './schema.js';

type Db = NodePgDatabase<Record<string, unknown>>;

// Saves `value` under settings `key`, creating the row or replacing its value, and returns the
// row (undefined only if the database returned none).
export async function upsertSetting(db: Db, key: string, value: unknown) {
    const [row] = await db
        .insert(settings)
        .values({ key, value })
        .onConflictDoUpdate({ target: settingsKeyTarget, set: { value } })
        .returning();
    return row;
}

// Records `content` as a new publish node in an entity's history (dag_nodes), parented on its
// latest publish node, and returns the new node. Used for settings-backed documents (prefabs, the
// 404 page, the theme), whose entityId is the settings row's id.
export async function addPublishNode(db: Db, entityType: string, entityId: string, content: unknown) {
    const [latestPublishNode] = await db
        .select()
        .from(dagNodes)
        .where(and(eq(dagNodes.entityType, entityType), eq(dagNodes.entityId, entityId), eq(dagNodes.nodeType, 'publish')))
        .orderBy(desc(dagNodes.createdAt))
        .limit(1);

    const [publishNode] = await db.insert(dagNodes).values({
        entityType,
        entityId,
        parentId: latestPublishNode?.id ?? null,
        content,
        nodeType: 'publish',
    }).returning();
    return publishNode;
}
