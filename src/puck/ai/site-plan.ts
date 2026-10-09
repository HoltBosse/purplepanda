import type { Data } from "@puckeditor/core";
import * as z from "zod";

// The AI site assistant's plan (see ./site-agent.server.ts): a list of steps over pages and
// templates. Steps that create something give it a `key`, so later steps in the same plan can
// refer to it before it exists — as a parent page, or as the template a page uses. Anything else
// is referred to by its real id.

const key = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{0,40}$/, "keys are short lowercase words joined by hyphens")
  .describe("A short name for this new item, unique in the plan, for later steps to refer to it");
const brief = z.string().min(1).max(4000).describe("What to build or change, in enough detail for a page builder working on this item alone");
const alias = z.string().regex(/^[a-z-]+$/, "aliases are lowercase letters and hyphens").max(80);

export const planStepSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("create_template"), key, title: z.string().min(1).max(120), brief }),
  z.object({ kind: z.literal("edit_template"), templateId: z.uuid(), brief }),
  z.object({
    kind: z.literal("create_page"),
    key,
    title: z.string().min(1).max(120),
    alias,
    parent: z.string().nullable().describe("Existing page id, key of a page created in this plan, or null for a top-level page"),
    template: z
      .string()
      .nullable()
      .describe('Existing template id, key of a template created in this plan, "none" for no template, or null for the site default'),
    brief,
  }),
  z.object({ kind: z.literal("edit_page"), pageId: z.uuid(), brief }),
  z.object({
    kind: z.literal("set_page_template"),
    page: z.string().describe("Existing page id or key of a page created in this plan"),
    template: z.string().describe("Existing template id or key of a template created in this plan"),
  }),
]);

export const planSchema = z.object({
  summary: z.string().min(1).max(2000).describe("One or two sentences for the author: what this plan does"),
  designNotes: z
    .string()
    .max(4000)
    .describe("Shared direction every builder gets: tone, audience, color scheme choices, section patterns, so the pages feel like one site"),
  steps: z.array(planStepSchema).min(1).max(40),
});

// For the planner's submit_plan tool, so the model is asked for exactly what's validated.
export const planJsonSchema = (() => {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(planSchema) as Record<string, unknown>;
  return schema;
})();

export type PlanStep = z.infer<typeof planStepSchema>;
export type Plan = z.infer<typeof planSchema>;

export type StepStatus = "pending" | "building" | "built" | "failed" | "applied" | "skipped";

// A step as the job keeps it: the plan step plus what building and applying it produced.
export type JobStep = {
  step: PlanStep;
  status: StepStatus;
  // The built document (create/edit steps), held until the author applies the job.
  content?: Data;
  // The builder's own summary of what it made.
  note?: string;
  error?: string;
  // Where it landed once applied.
  result?: { entity: "page" | "template"; id: string; draftId?: string };
};

export type SiteSnapshot = { pageIds: ReadonlySet<string>; templateIds: ReadonlySet<string> };

export function stepKey(step: PlanStep): string | undefined {
  return step.kind === "create_page" || step.kind === "create_template" ? step.key : undefined;
}

// Problems that would stop the plan from being applied as written: duplicate keys, references to
// things that neither exist nor are created by the plan, the wrong kind of thing referenced, and
// a page set as its own ancestor. Returned as messages for the planner to fix.
export function checkPlan(plan: Plan, site: SiteSnapshot): string[] {
  const problems: string[] = [];
  const pageKeys = new Set<string>();
  const templateKeys = new Set<string>();
  for (const step of plan.steps) {
    const k = stepKey(step);
    if (!k) continue;
    if (pageKeys.has(k) || templateKeys.has(k)) problems.push(`Key "${k}" is used twice.`);
    (step.kind === "create_page" ? pageKeys : templateKeys).add(k);
  }

  const isPage = (ref: string) => pageKeys.has(ref) || site.pageIds.has(ref);
  const isTemplate = (ref: string) => templateKeys.has(ref) || site.templateIds.has(ref);

  const parentOf = new Map<string, string>();
  for (const [i, step] of plan.steps.entries()) {
    const where = `Step ${i + 1} (${step.kind})`;
    switch (step.kind) {
      case "edit_page":
        if (!site.pageIds.has(step.pageId)) problems.push(`${where}: no page with id ${step.pageId}.`);
        break;
      case "edit_template":
        if (!site.templateIds.has(step.templateId)) problems.push(`${where}: no template with id ${step.templateId}.`);
        break;
      case "create_page":
        if (step.parent !== null && !isPage(step.parent)) problems.push(`${where}: parent "${step.parent}" is neither a page id nor a page key.`);
        if (step.parent !== null) parentOf.set(step.key, step.parent);
        if (step.template !== null && step.template !== "none" && !isTemplate(step.template)) {
          problems.push(`${where}: template "${step.template}" is neither a template id nor a template key.`);
        }
        break;
      case "set_page_template":
        if (!isPage(step.page)) problems.push(`${where}: page "${step.page}" is neither a page id nor a page key.`);
        if (!isTemplate(step.template)) problems.push(`${where}: template "${step.template}" is neither a template id nor a template key.`);
        break;
      case "create_template":
        break;
    }
  }

  for (const start of parentOf.keys()) {
    const seen = new Set<string>([start]);
    for (let at = parentOf.get(start); at !== undefined; at = parentOf.get(at)) {
      if (seen.has(at)) {
        problems.push(`Page "${start}" ends up inside itself through its parents.`);
        break;
      }
      seen.add(at);
    }
  }
  return problems;
}

// The order steps are applied in: templates first (pages may use them), then new pages with each
// parent before its children, then edits and template assignments. Indexes into `steps`.
export function applyOrder(steps: PlanStep[]): number[] {
  const rank: Record<PlanStep["kind"], number> = { create_template: 0, edit_template: 1, create_page: 2, edit_page: 3, set_page_template: 4 };
  const indexes = steps.map((_, i) => i).sort((a, b) => rank[steps[a]!.kind] - rank[steps[b]!.kind] || a - b);

  const pageSteps = indexes.filter((i) => steps[i]!.kind === "create_page");
  const byKey = new Map(pageSteps.map((i) => [(steps[i] as Extract<PlanStep, { kind: "create_page" }>).key, i]));
  const ordered: number[] = [];
  const placed = new Set<number>();
  const place = (i: number, trail: Set<number>) => {
    if (placed.has(i) || trail.has(i)) return;
    trail.add(i);
    const parent = (steps[i] as Extract<PlanStep, { kind: "create_page" }>).parent;
    const parentStep = parent !== null ? byKey.get(parent) : undefined;
    if (parentStep !== undefined) place(parentStep, trail);
    placed.add(i);
    ordered.push(i);
  };
  for (const i of pageSteps) place(i, new Set());

  return [...indexes.filter((i) => steps[i]!.kind.endsWith("_template") && steps[i]!.kind !== "set_page_template"), ...ordered, ...indexes.filter((i) => steps[i]!.kind === "edit_page" || steps[i]!.kind === "set_page_template")];
}

// What a step does, in a few words, for the job screen.
export function describeStep(step: PlanStep, titles: { pages: ReadonlyMap<string, string>; templates: ReadonlyMap<string, string> }): string {
  const page = (ref: string) => titles.pages.get(ref) ?? ref;
  const template = (ref: string | null) => (ref === null ? "the default template" : ref === "none" ? "no template" : (titles.templates.get(ref) ?? ref));
  switch (step.kind) {
    case "create_template":
      return `Create template “${step.title}”`;
    case "edit_template":
      return `Edit template “${template(step.templateId)}”`;
    case "create_page":
      return `Create page “${step.title}” (/${step.alias})${step.parent ? ` under “${page(step.parent)}”` : ""} using ${template(step.template)}`;
    case "edit_page":
      return `Edit page “${page(step.pageId)}”`;
    case "set_page_template":
      return `Set “${page(step.page)}” to use template “${template(step.template)}”`;
  }
}
