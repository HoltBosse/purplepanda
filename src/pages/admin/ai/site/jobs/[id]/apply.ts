import type { APIContext } from "astro";
import * as z from "zod";
import { aiUnavailableReason } from "../../../../../../puck/ai/enabled.server.js";
import { applyJob, getJob, JobError, jobView } from "../../../../../../puck/ai/site-agent.server.js";

const bodySchema = z.object({
  approved: z.array(z.number().int().min(0)).max(100),
  mode: z.enum(["draft", "publish"]),
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

// Writes the steps the author approved to the site (see applyJob). Refused while AI is off for the
// site, like starting or resuming a job: turning it off stops the assistant's changes landing too.
export async function POST(context: APIContext): Promise<Response> {
  const userId = (await context.session?.get("userId")) as string | undefined;
  if (!userId) return json({ error: "Not signed in." }, 401);
  const unavailable = await aiUnavailableReason();
  if (unavailable) return json({ error: unavailable }, 403);
  const body = bodySchema.safeParse(await context.request.json().catch(() => null));
  if (!body.success) return json({ error: "Malformed request." }, 400);

  const id = context.params.id!;
  try {
    await applyJob(id, { approved: new Set(body.data.approved), mode: body.data.mode, userId });
  } catch (error) {
    if (error instanceof JobError) return json({ error: error.message }, 409);
    console.error("Applying AI site job failed", error);
    return json({ error: "Applying failed." }, 500);
  }
  const row = await getJob(id);
  return row ? json(await jobView(row)) : json({ error: "Job not found." }, 404);
}
