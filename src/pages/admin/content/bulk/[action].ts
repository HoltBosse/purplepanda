import type { APIContext } from "astro";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../../../../db/db.js";
import { pages } from "../../../../db/schema.js";

const ACTIONS = ["publish", "unpublish", "delete"] as const;
type Action = typeof ACTIONS[number];

const stateMap: Record<Action, number> = {
    publish: 1,
    unpublish: 0,
    delete: -1,
};

const idsSchema = z.array(z.uuid()).min(1);

export async function POST(context: APIContext): Promise<Response> {
    const { action, typeId } = context.params;

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
    await db.update(pages).set({ state: stateMap[action as Action] }).where(inArray(pages.id, result.data));

    return context.redirect(`/admin/content/${typeId}`);
}
