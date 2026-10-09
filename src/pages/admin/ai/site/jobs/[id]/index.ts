import type { APIContext } from "astro";
import { getJob, jobView } from "../../../../../../puck/ai/site-agent.server.js";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

export async function GET(context: APIContext): Promise<Response> {
  const row = await getJob(context.params.id!);
  if (!row) return json({ error: "Job not found." }, 404);
  return json(await jobView(row));
}
