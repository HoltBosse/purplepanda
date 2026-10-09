import type { APIContext } from "astro";
import { cancelJob, getJob, jobView } from "../../../../../../puck/ai/site-agent.server.js";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

// Always allowed, even with AI turned off for the site: cancelling only ever stops spending.
export async function POST(context: APIContext): Promise<Response> {
  const id = context.params.id!;
  const row = await getJob(id);
  if (!row) return json({ error: "Job not found." }, 404);
  if (["planning", "building", "review", "clarify"].includes(row.status)) await cancelJob(id);
  const updated = await getJob(id);
  return json(updated ? await jobView(updated) : null);
}
