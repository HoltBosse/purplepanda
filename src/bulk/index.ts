import type { APIContext } from "astro";
import { z } from "zod";
import { getDb } from "../db/db.js";
import { inArray } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

const ACTIONS = ["publish", "unpublish", "delete"] as const;
type Action = typeof ACTIONS[number];

const stateMap: Record<Action, number> = {
    publish: 1,
    unpublish: 0,
    delete: -1,
};

const idsSchema = z.array(z.string().uuid()).min(1);

export function createBulkHandler(table: PgTable & { id: any; state: any }, redirectTo: string) {
    return async function POST(context: APIContext): Promise<Response> {
        const { action } = context.params;

        if (!ACTIONS.includes(action as Action)) {
            return context.rewrite("/admin/404");
        }

        const formData = await context.request.formData();
        const rawIds = formData.getAll("selected[]");

        const result = idsSchema.safeParse(rawIds);
        if (!result.success) {
            return new Response("Invalid IDs", { status: 400 });
        }

        const db = getDb();
        await db.update(table).set({ state: stateMap[action as Action] }).where(inArray(table.id, result.data));

        return context.redirect(redirectTo);
    };
}
