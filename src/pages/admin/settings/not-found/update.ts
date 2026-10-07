import type { APIContext } from "astro";
import { eq } from 'drizzle-orm';
import * as z from "zod";
import { addAlertToSession, alertType, createAlert } from "../../../../alert/index.js";
import { addAction } from "../../../../audit/index.js";
import { invalidateSettingsCache } from "../../../../db/content-cache.js";
import { getDb } from "../../../../db/db.js";
import { NOT_FOUND_SETTING_KEY } from "../../../../db/not-found.js";
import { settings } from "../../../../db/schema.js";
import { addPublishNode, upsertSetting } from "../../../../db/settings.js";
import { runOverride } from "../../../../hooks/index.js";
import { getDisabledComponents } from "../../../../puck/site-components.server.js";
import { contentValidationErrorsSchema, formatValidationErrors, validateContentTree } from "../../../../puck/validate-content.js";
import externalPuckConfig from "../../../../puck.config.js";

export async function POST(context: APIContext): Promise<Response> {
    const db = getDb();
    const settingsKey = NOT_FOUND_SETTING_KEY;
    const redirectPath = '/admin/settings/not-found';

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

    const validationErrors = validateContentTree(externalPuckConfig ?? {}, parsedContent, { disabledComponents: await getDisabledComponents() });
    const overrideErrors = await runOverride("content:validate", { entity: "not-found", content: parsedContent }, contentValidationErrorsSchema);
    if (overrideErrors) validationErrors.push(...overrideErrors);
    if (validationErrors.length > 0) {
        const alert = createAlert(alertType.error, `Fix the following before saving: ${formatValidationErrors(validationErrors)}`);
        await addAlertToSession(context.session, alert);
        return context.redirect(redirectPath);
    }

    const [existing] = await db.select().from(settings).where(eq(settings.key, settingsKey)).limit(1);
    const isNew = !existing;

    const settingRow = await upsertSetting(db, settingsKey, parsedContent);

    if (!settingRow) {
        return new Response("Failed to save 404 page", { status: 500 });
    }
    invalidateSettingsCache(db);

    const publishNode = await addPublishNode(db, 'not-found', settingRow.id, parsedContent);

    const userId = await context.session?.get("userId");
    await addAction(
        isNew ? "not-found:create" : "not-found:update",
        { id: settingRow.id, version: publishNode?.id ?? null },
        userId,
        {
            message: isNew ? "404 page was created" : "404 page was updated",
            placeholders: {
                id: { lookupColumn: settings.id, displayColumn: settings.key },
            },
        },
    );

    const message = isNew ? "404 page created successfully." : "404 page updated successfully.";
    const alert = createAlert(alertType.success, message);
    await addAlertToSession(context.session, alert);

    return context.redirect("/admin/settings");
}
