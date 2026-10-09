import { eq, sql } from "drizzle-orm";
import { getTenantDomainMap } from "../../db/content-cache.js";
import { getDb } from "../../db/db.js";
import { aiSpend } from "../../db/schema.js";
import { requireTenant } from "../../tenant/context.js";

// The AI tab in the editors and the site assistant both need an Anthropic key, and the request's
// site has to have AI enabled (on its form under /dashboard/admin/sites). Without both they're
// hidden rather than shown and left to fail on every request.
export function aiKeyConfigured(): boolean {
  return Boolean(process.env.CLAUDE_API_KEY?.trim());
}

async function siteAiSettings(): Promise<{ enabled: boolean; monthlyBudgetUsd: number }> {
  const map = await getTenantDomainMap(getDb());
  return map.aiByTenant.get(requireTenant().id) ?? { enabled: false, monthlyBudgetUsd: 0 };
}

export async function aiEnabled(): Promise<boolean> {
  return aiKeyConfigured() && (await siteAiSettings()).enabled;
}

// The first day of the current calendar month (UTC), as ai_spend.month stores it.
export function currentAiMonth(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

// What the request's site has spent on AI this month, against its monthly budget.
export async function getAiBudget(): Promise<{ spentUsd: number; budgetUsd: number }> {
  const [settings, [row]] = await Promise.all([
    siteAiSettings(),
    getDb().select({ costUsd: aiSpend.costUsd }).from(aiSpend).where(eq(aiSpend.month, currentAiMonth())).limit(1),
  ]);
  return { spentUsd: row?.costUsd ?? 0, budgetUsd: settings.monthlyBudgetUsd };
}

// Thrown (or its message returned) when the request's site can't make AI calls right now. Its
// message is written for the author.
export class AiUnavailableError extends Error {}

export async function aiUnavailableReason(): Promise<string | null> {
  if (!aiKeyConfigured()) return "The AI assistant isn't configured (CLAUDE_API_KEY is not set).";
  if (!(await siteAiSettings()).enabled) return "The AI assistant isn't enabled for this site.";
  const { spentUsd, budgetUsd } = await getAiBudget();
  if (spentUsd >= budgetUsd) return `This site has used its $${budgetUsd.toFixed(2)} AI budget for this month.`;
  return null;
}

// Checked before every model call, so turning AI off or running out of budget also stops a turn or
// job already under way (a call in flight still finishes, so spend can run slightly over).
export async function assertAiAvailable(): Promise<void> {
  const reason = await aiUnavailableReason();
  if (reason) throw new AiUnavailableError(reason);
}

// Adds a model call's cost to the site's spend for this month. Fails closed: spend that can't be
// recorded can't be checked against the budget either, so the turn or job stops (with an
// author-facing AiUnavailableError) rather than carrying on unmetered.
export async function recordAiSpend(usd: number): Promise<void> {
  if (!(usd > 0)) return;
  try {
    await getDb()
      .insert(aiSpend)
      .values({ month: currentAiMonth(), costUsd: usd })
      .onConflictDoUpdate({ target: [aiSpend.tenantId, aiSpend.month], set: { costUsd: sql`${aiSpend.costUsd} + ${usd}` } });
  } catch (error) {
    console.error("Recording AI spend failed", error);
    throw new AiUnavailableError("The AI assistant stopped because its usage couldn't be recorded. Try again shortly.");
  }
}
