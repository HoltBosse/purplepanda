import type { APIContext } from "astro";
import { aiUnavailableReason } from "../../../../../../puck/ai/enabled.server.js";
import { getJob, jobView, startJob } from "../../../../../../puck/ai/site-agent.server.js";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

// Picks a job back up after its server process went away mid-run (or after a failure): planning
// starts over if there was no plan yet; otherwise only the steps that weren't built are built.
export async function POST(context: APIContext): Promise<Response> {
  const id = context.params.id!;
  const row = await getJob(id);
  if (!row) return json({ error: "Job not found." }, 404);
  const unavailable = await aiUnavailableReason();
  if (unavailable) return json({ error: unavailable }, 403);
  const view = await jobView(row);
  if (!(view.stale || row.status === "failed")) {
    return json({ error: "This job is still running." }, 409);
  }
  startJob(id);
  return json(view, 202);
}
