import externalPuckConfig from "virtual:purplepanda/puck-config";
import type { APIContext } from "astro";
import { and, desc, eq } from 'drizzle-orm';
import * as z from "zod";
import { addAction } from "../../../../actions/index.js";
import { addAlertToSession, alertType, createAlert } from "../../../../alert/index.js";
import { getDb } from "../../../../db/db.js";
import { prefabSettingKey } from "../../../../db/prefabs.js";
import { dagNodes, settings } from "../../../../db/schema.js";
import { formatValidationErrors, validateContentTree } from "../../../../puck/validate-content.js";

export async function POST(context: APIContext): Promise<Response> {
    const db = getDb();
    const { uuid } = context.params;
    const settingsKey = prefabSettingKey(uuid);
    const redirectPath = uuid ? `/admin/settings/prefab/${uuid}` : '/admin/settings/prefab/default';

    const formData = await context.request.formData();
    const contentField = formData.get("content");
    const contentSchema = z.string().refine((val) => {
        try {
            JSON.parse(val);
            return true;
        } catch (_e) {
            return false;
        }
    }, "Content must be a valid JSON string");
    const contentResult = contentSchema.safeParse(contentField);

    if (!contentResult.success) {
        const alert = createAlert(alertType.error, "Invalid content Submitted");
        await addAlertToSession(context.session, alert);
        return context.redirect(redirectPath);
    }

    const parsedContent = JSON.parse(contentResult.data);

    const validationErrors = validateContentTree(externalPuckConfig ?? {}, parsedContent);
    if (validationErrors.length > 0) {
        const alert = createAlert(alertType.error, `Fix the following before saving: ${formatValidationErrors(validationErrors)}`);
        await addAlertToSession(context.session, alert);
        return context.redirect(redirectPath);
    }

    const [existing] = await db.select().from(settings).where(eq(settings.key, settingsKey)).limit(1);
    const isNewPrefab = !existing;

    const [settingRow] = await db
        .insert(settings)
        .values({ key: settingsKey, value: parsedContent })
        .onConflictDoUpdate({ target: settings.key, set: { value: parsedContent } })
        .returning();

    if (!settingRow) {
        return new Response("Failed to save prefab", { status: 500 });
    }

    const [latestPublishNode] = await db
        .select()
        .from(dagNodes)
        .where(and(eq(dagNodes.entityType, 'prefab'), eq(dagNodes.entityId, settingRow.id), eq(dagNodes.nodeType, 'publish')))
        .orderBy(desc(dagNodes.createdAt))
        .limit(1);

    const [publishNode] = await db.insert(dagNodes).values({
        entityType: 'prefab',
        entityId: settingRow.id,
        parentId: latestPublishNode?.id ?? null,
        content: parsedContent,
        nodeType: 'publish',
    }).returning();

    const userId = await context.session?.get("userId");
    await addAction(
        isNewPrefab ? "prefabcreate" : "prefabupdate",
        { id: settingRow.id, version: publishNode?.id ?? null },
        userId,
        {
            message: isNewPrefab ? "Prefab {id} was created" : "Prefab {id} was updated",
            placeholders: {
                id: { lookupColumn: settings.id, displayColumn: settings.key },
            },
        },
    );

    const message = isNewPrefab ? "Prefab created successfully." : "Prefab updated successfully.";
    const alert = createAlert(alertType.success, message);
    await addAlertToSession(context.session, alert);

    return context.redirect("/admin/settings");
}
