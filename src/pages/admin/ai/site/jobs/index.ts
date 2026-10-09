import type { APIContext } from "astro";
import { RateLimiterRes } from "rate-limiter-flexible";
import * as z from "zod";
import { postgresLimiter } from "../../../../../db/rate-limiter.js";
import { aiUnavailableReason } from "../../../../../puck/ai/enabled.server.js";
import { createJob, getJob, jobView, listJobs, startJob } from "../../../../../puck/ai/site-agent.server.js";

// The AI site assistant's jobs (see puck/ai/site-agent.server.ts): GET lists recent ones, POST
// starts a new one. Jobs then run in the background; the job screen polls ./[id].

// A job is a planning call plus one build per page or template, so these caps are per job, not per
// message as in the editors' AI tab. Each job also stops at its own budget (AI_JOB_BUDGET_USD).
const perUserLimiter = postgresLimiter({ tableName: "purplepanda_rate_limits", keyPrefix: "ai_site_job_user", points: 20, duration: 24 * 60 * 60 });
const perSiteLimiter = postgresLimiter({ tableName: "purplepanda_rate_limits", keyPrefix: "ai_site_job_site", points: 50, duration: 24 * 60 * 60 });

const bodySchema = z.object({ request: z.string().trim().min(1).max(8000) });

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

async function consume(limiter: ReturnType<typeof postgresLimiter>, key: string): Promise<boolean> {
  try {
    await limiter.consume(key);
    return true;
  } catch (error) {
    if (error instanceof RateLimiterRes) return false;
    throw error;
  }
}

export async function GET(): Promise<Response> {
  const rows = await listJobs();
  return json(rows.map((row) => ({ id: row.id, status: row.status, request: row.request, costUsd: row.costUsd, createdAt: row.createdAt })));
}

export async function POST(context: APIContext): Promise<Response> {
  const unavailable = await aiUnavailableReason();
  if (unavailable) return json({ error: unavailable }, 403);
  const userId = (await context.session?.get("userId")) as string | undefined;
  if (!userId) return json({ error: "Not signed in." }, 401);

  const body = bodySchema.safeParse(await context.request.json().catch(() => null));
  if (!body.success) return json({ error: "Describe what you'd like the assistant to do." }, 400);

  const tenantId = context.locals.tenant.id;
  if (!(await consume(perSiteLimiter, tenantId)) || !(await consume(perUserLimiter, `${tenantId}:${userId}`))) {
    return json({ error: "The site assistant's daily limit has been reached. Try again tomorrow." }, 429);
  }

  const id = await createJob({ request: body.data.request, userId });
  // Started from inside this request's tenant context, which the job keeps for its whole run.
  startJob(id);
  const row = await getJob(id);
  return json(row ? await jobView(row) : { id }, 201);
}
