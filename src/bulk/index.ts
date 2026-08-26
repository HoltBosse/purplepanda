import type { APIContext } from "astro";
import { inArray } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { z } from "zod";
import { addAlertToSession, alertType, createAlert } from "../alert/index.js";
import { getDb } from "../db/db.js";

const ACTIONS = ["publish", "unpublish", "delete"] as const;
type Action = typeof ACTIONS[number];

const stateMap: Record<Action, number> = {
    publish: 1,
    unpublish: 0,
    delete: -1,
};

const idsSchema = z.array(z.uuid()).min(1);

// Consulted only for "unpublish"/"delete" (see below) — return a user-facing message to block
// the entire batch (e.g. one of the selected ids is still relied on elsewhere), or a falsy value
// to allow it.
export type BulkGuard = (ids: string[], action: "unpublish" | "delete") => Promise<string | null | undefined> | string | null | undefined;

export function createBulkHandler(table: PgTable & { id: any; state: any }, redirectTo: string, guard?: BulkGuard) {
    return async function POST(context: APIContext): Promise<Response> {
        if (!ACTIONS.includes(context.params.action as Action)) {
            return context.rewrite("/admin/404");
        }
        const action = context.params.action as Action;

        const formData = await context.request.formData();
        const rawIds = formData.getAll("selected[]");

        const result = idsSchema.safeParse(rawIds);
        if (!result.success) {
            return new Response("Invalid IDs", { status: 400 });
        }

        if (guard && action !== "publish") {
            const blockMessage = await guard(result.data, action);
            if (blockMessage) {
                await addAlertToSession(context.session, createAlert(alertType.error, blockMessage));
                return context.redirect(redirectTo);
            }
        }

        const db = getDb();
        await db.update(table).set({ state: stateMap[action] }).where(inArray(table.id, result.data));

        return context.redirect(redirectTo);
    };
}
