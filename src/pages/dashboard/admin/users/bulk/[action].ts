import type { APIContext } from "astro";
import { inArray } from "drizzle-orm";
import * as z from "zod";
import { addAlertToSession, alertType, createAlert } from "../../../../../alert/index.js";
import { addAction } from "../../../../../audit/index.js";
import { dashboardAccess } from "../../../../../auth/dashboard.js";
import { signOutEverywhere } from "../../../../../auth/index.js";
import { getDb } from "../../../../../db/db.js";
import { users } from "../../../../../db/schema.js";
import { sameOriginReferer } from "../../../../../http/referer.js";

const actions = {
    enable: { state: 1, verb: "enabled", message: "{id} was enabled on every site" },
    disable: { state: 0, verb: "disabled on every site", message: "{id} was disabled on every site" },
    delete: { state: -1, verb: "deleted", message: "{id} was deleted" },
} as const;
const actionSchema = z.enum(["enable", "disable", "delete"]);

const idsSchema = z.array(z.uuid()).min(1);

// The bulk form of state/[id].ts: sets each selected account's own state (users.state), on every
// site at once. Disabling or deleting also ends every sign-in the account has. A deleted account
// keeps its memberships and roles, so enabling it again restores it as it was. The signed-in
// account is always skipped, since changing it would lock them out.
export async function POST(context: APIContext): Promise<Response> {
    const access = await dashboardAccess(context, { superAdmin: true });
    if (access.response) {
        return access.response;
    }

    const parsedAction = actionSchema.safeParse(context.params.action);
    if (!parsedAction.success) {
        return context.rewrite("/404");
    }
    const action = actions[parsedAction.data];

    const formData = await context.request.formData();
    const result = idsSchema.safeParse(formData.getAll("selected[]"));
    if (!result.success) {
        return new Response("Invalid IDs", { status: 400 });
    }

    const ids = result.data.filter((id) => id !== access.user.id);
    const db = getDb();
    const targets = ids.length > 0
        ? await db.select({ id: users.id }).from(users).where(inArray(users.id, ids))
        : [];

    if (targets.length > 0) {
        await db.update(users).set({ state: action.state }).where(inArray(users.id, targets.map((target) => target.id)));
        for (const target of targets) {
            if (action.state < 1) {
                await signOutEverywhere(target.id);
            }
            await addAction(`user:${parsedAction.data}`, { id: target.id }, access.user.id, {
                message: action.message,
                placeholders: { id: { lookupColumn: users.id, displayColumn: users.email } },
            });
        }
        await addAlertToSession(context.session, createAlert(alertType.success, `${targets.length} account(s) ${action.verb}.`));
    }
    if (targets.length < result.data.length && result.data.includes(access.user.id)) {
        await addAlertToSession(context.session, createAlert(alertType.warning, "Your own account was left unchanged."));
    }

    return context.redirect(sameOriginReferer(context) ?? "/dashboard/admin/users");
}
