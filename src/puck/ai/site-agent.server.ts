import "dotenv/config";
import { AsyncLocalStorage } from "node:async_hooks";
import Anthropic from "@anthropic-ai/sdk";
import type { Config, Data } from "@puckeditor/core";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import * as z from "zod";
import { getDb } from "../../db/db.js";
import { aiJobs, pages, templates } from "../../db/schema.js";
import externalPuckConfig from "../../puck.config.js";
import { ContentValidationFailed, createDraftWithContent, DraftLimitReached, NotFoundError, savePage, saveTemplate, setPageTemplate } from "../../services/content.js";
import { getTheme } from "../../theme/server.js";
import { setThemeSummaryProvider, type ThemeSummary, themeSummary } from "../../theme/summary.js";
import { filterConfigByLocation } from "../index.js";
import { getDisabledComponents } from "../site-components.server.js";
import { buildCatalog } from "./catalog.js";
import { AiUnavailableError, aiUnavailableReason, assertAiAvailable, recordAiSpend } from "./enabled.server.js";
import { describeAiError, runHarness } from "./harness.server.js";
import { applyOrder, checkPlan, describeStep, type JobStep, type Plan, type PlanStep, planJsonSchema, planSchema, type SiteSnapshot, stepKey } from "./site-plan.js";
import { withTemplateSlot } from "./template-slot-config.js";
import { outline, shapesFromConfig } from "./tree.js";

// The AI site assistant (admin → AI): changes across the whole site — new templates, new pages
// in the page tree, edits to existing ones, which template each page uses — from one request.
//
// A job runs in three stages:
//  1. Planning: Claude Sonnet 5.5, with read-only tools over the site, writes a plan
//     (./site-plan.ts) and submits it.
//  2. Building: each step that creates or edits a page or template is built by the same Claude
//     Haiku 5.5 harness as the editors' AI tab (./harness.server.ts), a few at a time. The results
//     are kept on the job, not written to the site — except images the builders import into the
//     media library, since the built pages refer to them.
//  3. Review: the author reviews the steps and applies the ones they want, through the same
//     services the admin's own forms use (services/content.ts). By default new pages arrive
//     unpublished and edits to existing pages as drafts.
//
// Jobs run in the background inside the server process, persisting their progress to ai_jobs as
// they go, so the job screen polls rather than holding a request open for minutes.

export const PLANNER_MODEL = "claude-sonnet-5-5";
// Claude Sonnet 5.5 list prices, USD per million tokens.
const PLANNER_PRICE = { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.1 };
const PLANNER_MAX_STEPS = 12;
const BUILD_CONCURRENCY = 3;
// A whole job stops once it has spent this much (USD), checked between steps.
const DEFAULT_JOB_BUDGET_USD = 1;

export type JobStatus = "planning" | "building" | "review" | "applying" | "applied" | "failed" | "cancelled" | "clarify";

const RUNNING: readonly JobStatus[] = ["planning", "building", "applying"];

type LogEntry = { at: string; text: string };

type JobRow = typeof aiJobs.$inferSelect;

function budget(): number {
  const configured = Number(process.env.AI_JOB_BUDGET_USD);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_JOB_BUDGET_USD;
}

// The theme field hints (scheme, button style, ... ids) read the theme through
// getInjectedTheme(), which in the browser is a global the admin page injects. Builders here run
// for many sites in one process, so each runs with its own site's theme in async context.
const themeContext = new AsyncLocalStorage<ThemeSummary>();
setThemeSummaryProvider(() => themeContext.getStore());

// A failure whose message is written for the author, as opposed to one from the database or the
// SDK, whose text can carry internal details.
export class JobError extends Error {}

// What a job or step shows for a failure: its own message when it's one written for the author,
// otherwise a generic one (and the details go to the server log).
export function jobErrorMessage(error: unknown): string {
  if (
    error instanceof JobError ||
    error instanceof AiUnavailableError ||
    error instanceof NotFoundError ||
    error instanceof ContentValidationFailed ||
    error instanceof DraftLimitReached
  ) {
    return error.message;
  }
  console.error("AI site job error", error);
  return describeAiError(error);
}

// Jobs this process is running, so a cancel can stop the one in flight straight away.
const running = new Map<string, AbortController>();

// ---------------------------------------------------------------------------------------------
// The site as the planner sees it

type PageInfo = { id: string; title: string; path: string; parent: string | null; templateId: string | null; noTemplate: boolean; live: boolean };
type TemplateInfo = { id: string; title: string };

async function readSite(): Promise<{ pages: PageInfo[]; templates: TemplateInfo[] }> {
  const db = getDb();
  const [pageRows, templateRows] = await Promise.all([
    db
      .select({ id: pages.id, state: pages.state, content: pages.content, templateId: pages.templateId, noTemplate: pages.noTemplate })
      .from(pages)
      .where(and(gt(pages.state, -1), isNull(pages.contentType))),
    db.select({ id: templates.id, content: templates.content }).from(templates).where(eq(templates.state, 1)),
  ]);
  const props = (content: unknown) => ((content as { root?: { props?: Record<string, unknown> } })?.root?.props ?? {}) as Record<string, unknown>;
  const byId = new Map(pageRows.map((row) => [row.id, row]));
  const pathOf = (id: string, seen = new Set<string>()): string => {
    const row = byId.get(id);
    if (!row || seen.has(id)) return "";
    seen.add(id);
    const p = props(row.content);
    const parent = typeof p.parentPage === "string" && p.parentPage ? pathOf(p.parentPage, seen) : "";
    return `${parent}/${String(p.alias ?? "")}`;
  };
  return {
    pages: pageRows.map((row) => {
      const p = props(row.content);
      return {
        id: row.id,
        title: String(p.title ?? "") || "Untitled",
        path: pathOf(row.id),
        parent: typeof p.parentPage === "string" && p.parentPage ? p.parentPage : null,
        templateId: row.templateId,
        noTemplate: row.noTemplate,
        live: row.state === 1,
      };
    }),
    templates: templateRows.map((row) => ({ id: row.id, title: String(props(row.content).title ?? "") || "Untitled template" })),
  };
}

function pageConfig(): Partial<Config> {
  // Page settings (title, alias, parent) come from the plan and are set when applying, so the
  // builder is offered none — it only builds the page body.
  return { ...filterConfigByLocation(externalPuckConfig ?? {}, "page"), root: { fields: {} } };
}

function templateConfig(): Partial<Config> {
  return withTemplateSlot({ ...filterConfigByLocation(externalPuckConfig ?? {}, "template"), root: { fields: {} } });
}

// ---------------------------------------------------------------------------------------------
// Job persistence

export async function createJob(input: { request: string; userId: string }): Promise<string> {
  const [row] = await getDb().insert(aiJobs).values({ request: input.request, userId: input.userId }).returning({ id: aiJobs.id });
  if (!row) throw new Error("Failed to create job");
  return row.id;
}

export async function getJob(id: string): Promise<JobRow | undefined> {
  const [row] = await getDb().select().from(aiJobs).where(eq(aiJobs.id, id)).limit(1);
  return row;
}

export async function listJobs(limit = 20): Promise<JobRow[]> {
  return getDb().select().from(aiJobs).orderBy(desc(aiJobs.createdAt)).limit(limit);
}

// The job as the job screen shows it: built content left out (it's only needed for previews and
// applying), each step described in words, and the site's titles for the ids the plan refers to.
export async function jobView(row: JobRow) {
  const site = await readSite();
  const plan = row.plan as Plan | null;
  const steps = (row.steps as JobStep[]) ?? [];
  const pageTitles = new Map<string, string>(site.pages.map((p) => [p.id, p.title]));
  const templateTitles = new Map<string, string>(site.templates.map((t) => [t.id, t.title]));
  for (const { step } of steps) {
    if (step.kind === "create_page") pageTitles.set(step.key, step.title);
    if (step.kind === "create_template") templateTitles.set(step.key, step.title);
  }
  // A job's process can die mid-run (a deploy, a crash). One that's gone quiet that long can be
  // resumed from where it got to.
  const stale = RUNNING.includes(row.status as JobStatus) && !running.has(row.id) && Date.now() - row.updatedAt.getTime() > 2 * 60 * 1000;
  return {
    id: row.id,
    status: row.status as JobStatus,
    request: row.request,
    summary: plan?.summary ?? null,
    designNotes: plan?.designNotes ?? null,
    error: row.error,
    costUsd: row.costUsd,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    stale,
    log: (row.log as LogEntry[]).slice(-60),
    steps: steps.map((s, index) => ({
      index,
      kind: s.step.kind,
      description: describeStep(s.step, { pages: pageTitles, templates: templateTitles }),
      brief: "brief" in s.step ? s.step.brief : null,
      status: s.status,
      note: s.note ?? null,
      error: s.error ?? null,
      result: s.result ?? null,
      outline: s.content ? outline(s.content, shapesFromConfig(s.step.kind.endsWith("template") ? templateConfig() : pageConfig())) : null,
      previewable: !!s.content,
    })),
  };
}

export type JobView = Awaited<ReturnType<typeof jobView>>;

// One job's in-memory state while it runs, written through to its row. Writes are chained so
// they land in order.
class JobState {
  private writing: Promise<unknown> = Promise.resolve();
  log: LogEntry[];
  steps: JobStep[];
  costUsd: number;

  constructor(readonly row: JobRow) {
    this.log = (row.log as LogEntry[]) ?? [];
    this.steps = (row.steps as JobStep[]) ?? [];
    this.costUsd = row.costUsd;
  }

  private save(fields: Partial<typeof aiJobs.$inferInsert>) {
    this.writing = this.writing
      .then(() => getDb().update(aiJobs).set({ ...fields, updatedAt: new Date() }).where(eq(aiJobs.id, this.row.id)))
      .catch((error) => console.error("Saving AI job progress failed", error));
    return this.writing;
  }

  note(text: string) {
    this.log.push({ at: new Date().toISOString(), text });
    return this.save({ log: this.log });
  }

  spend(usd: number) {
    this.costUsd += usd;
    return this.save({ costUsd: this.costUsd });
  }

  saveSteps() {
    return this.save({ steps: this.steps });
  }

  set(fields: Partial<typeof aiJobs.$inferInsert>) {
    return this.save(fields);
  }

  flush() {
    return this.writing;
  }
}

async function isCancelled(id: string): Promise<boolean> {
  const [row] = await getDb().select({ status: aiJobs.status }).from(aiJobs).where(eq(aiJobs.id, id)).limit(1);
  return row?.status === "cancelled";
}

// ---------------------------------------------------------------------------------------------
// Planning

const PLANNER_INSTRUCTIONS = `You plan changes to a website built with PurplePanda, a CMS whose pages and templates are made of components in a visual editor. An author describes what they want; you work out the steps to get there and submit them with submit_plan. Separate builders then build each page and template from your briefs, so your job is the structure and direction, not the content itself.

The site:
- Pages form a tree: each has a title, an alias (its URL segment; the path is the parent's path plus "/" + alias) and an optional parent page. Each page uses the site's default template, a specific template, or none.
- A template wraps pages: typically a header with navigation and a footer, around exactly one TemplateSlot where each page's own content appears.
- Images come from the media library (and, when available, free stock photos); the builders find them. Mention in a brief what images a page should have.

Step kinds:
- create_template / edit_template: build a new template, or change an existing one.
- create_page: a new page with its title, alias, parent and template.
- edit_page: change an existing page's content.
- set_page_template: make an existing (or planned) page use a template.
Give new pages and templates a key so later steps can refer to them before they exist.

How to plan:
- Look at the site first (list_pages, list_templates, and get_outline for anything you'll change or match), so you build on what's there instead of duplicating it.
- Plan only what the request needs. Don't restructure or rewrite things the author didn't ask about.
- Write each brief so a builder working on that item alone can do it well: purpose, sections in order, key copy points, images wanted, links to other pages by path. Use designNotes for what every builder should share: audience, tone, color scheme choices, section patterns.
- Navigation in a template should link to the site's real pages by path, including pages this plan creates.
- Aliases are lowercase letters and hyphens only. Keep titles short.
- If the request is too unclear to plan sensibly, don't guess: reply with a short question instead of submitting a plan.

Once the plan is submitted and accepted, reply with one short sentence.`;

const PLANNER_TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "list_pages",
    description: "List the site's pages: id, title, path, parent id, template, and whether it's live.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "list_templates",
    description: "List the site's templates: id and title.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_outline",
    description: "Outline of a page or template: its components one per line with short text previews.",
    input_schema: {
      type: "object",
      properties: { kind: { type: "string", enum: ["page", "template"] }, id: { type: "string" } },
      required: ["kind", "id"],
    },
  },
  {
    name: "submit_plan",
    description: "Submit the plan. It's checked for broken references; fix any problems reported and submit again.",
    input_schema: planJsonSchema as Anthropic.Beta.BetaTool.InputSchema,
    cache_control: { type: "ephemeral" },
  },
];

// get_outline's input comes from the model, so it's parsed like any other untrusted input.
const outlineInputSchema = z.object({ kind: z.enum(["page", "template"]), id: z.uuid() });

async function runPlannerTool(name: string, input: unknown, site: { pages: PageInfo[]; templates: TemplateInfo[] }): Promise<string> {
  switch (name) {
    case "list_pages": {
      if (site.pages.length === 0) return "The site has no pages yet.";
      const templateTitle = new Map(site.templates.map((t) => [t.id, t.title]));
      return site.pages
        .sort((a, b) => a.path.localeCompare(b.path))
        .map(
          (p) =>
            `${p.id} | ${JSON.stringify(p.title)} | ${p.path || "/"} | parent ${p.parent ?? "none"} | template ${
              p.noTemplate ? "none" : p.templateId ? JSON.stringify(templateTitle.get(p.templateId) ?? p.templateId) : "default"
            } | ${p.live ? "live" : "not live"}`,
        )
        .join("\n");
    }
    case "list_templates":
      return site.templates.length ? site.templates.map((t) => `${t.id} | ${JSON.stringify(t.title)}`).join("\n") : "The site has no templates yet.";
    case "get_outline": {
      const parsed = outlineInputSchema.safeParse(input);
      if (!parsed.success) throw new JobError(`Invalid get_outline input:\n${z.prettifyError(parsed.error)}`);
      const { kind, id } = parsed.data;
      const db = getDb();
      if (kind === "template") {
        const [row] = await db.select({ content: templates.content }).from(templates).where(eq(templates.id, id)).limit(1);
        if (!row) return "No template with that id.";
        return outline(row.content as Data, shapesFromConfig(templateConfig()));
      }
      const [row] = await db.select({ content: pages.content }).from(pages).where(and(eq(pages.id, id), isNull(pages.contentType))).limit(1);
      if (!row) return "No page with that id.";
      return outline(row.content as Data, shapesFromConfig(pageConfig()));
    }
    default:
      throw new JobError(`Unknown tool ${name}.`);
  }
}

function plannerCost(usage: Anthropic.Beta.BetaUsage): number {
  return (
    (usage.input_tokens * PLANNER_PRICE.input +
      usage.output_tokens * PLANNER_PRICE.output +
      (usage.cache_creation_input_tokens ?? 0) * PLANNER_PRICE.cacheWrite +
      (usage.cache_read_input_tokens ?? 0) * PLANNER_PRICE.cacheRead) /
    1_000_000
  );
}

// A one-paragraph view of what components exist, so plans only ask builders for what they can make.
function componentSummary(): string {
  const config = pageConfig();
  return Object.entries(config.components ?? {})
    .map(([name, component]) => {
      const slots = Object.entries((component.fields ?? {}) as Record<string, { type?: string }>)
        .filter(([, field]) => field?.type === "slot")
        .map(([key]) => key);
      return `${name}${component.label && component.label !== name ? ` (${component.label})` : ""}${slots.length ? ` [holds components]` : ""}`;
    })
    .join(", ");
}

async function plan(state: JobState, client: Anthropic, signal: AbortSignal): Promise<Plan | { question: string }> {
  const site = await readSite();
  const snapshot: SiteSnapshot = { pageIds: new Set(site.pages.map((p) => p.id)), templateIds: new Set(site.templates.map((t) => t.id)) };
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content: `<components>${componentSummary()}</components>\n<request>\n${state.row.request}\n</request>`,
    },
  ];

  for (let step = 0; step < PLANNER_MAX_STEPS; step++) {
    await assertAiAvailable();
    const response = await client.beta.messages.create(
      {
        model: PLANNER_MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        system: [{ type: "text", text: PLANNER_INSTRUCTIONS, cache_control: { type: "ephemeral" } }],
        tools: PLANNER_TOOLS,
        messages,
      },
      { signal },
    );
    const cost = plannerCost(response.usage);
    await Promise.all([state.spend(cost), recordAiSpend(cost)]);
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "refusal") throw new JobError("The assistant declined this request.");
    const toolUses = response.content.filter((block): block is Anthropic.Beta.BetaToolUseBlock => block.type === "tool_use");
    const text = response.content
      .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n")
      .trim();
    if (toolUses.length === 0) return { question: text || "I couldn't work out a plan for that. Could you describe what you want in more detail?" };

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    let accepted: Plan | undefined;
    for (const toolUse of toolUses) {
      if (toolUse.name === "submit_plan") {
        const parsed = planSchema.safeParse(toolUse.input);
        const problems = parsed.success ? checkPlan(parsed.data, snapshot) : parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
        if (parsed.success && problems.length === 0) {
          accepted = parsed.data;
          results.push({ type: "tool_result", tool_use_id: toolUse.id, content: "Plan accepted." });
        } else {
          await state.note("Revising the plan");
          results.push({ type: "tool_result", tool_use_id: toolUse.id, content: `The plan has problems:\n${problems.join("\n")}`, is_error: true });
        }
        continue;
      }
      await state.note(toolUse.name === "get_outline" ? "Reading the site's content" : "Looking at the site");
      try {
        results.push({ type: "tool_result", tool_use_id: toolUse.id, content: await runPlannerTool(toolUse.name, toolUse.input, site) });
      } catch (error) {
        const content = error instanceof JobError ? error.message : "That tool failed.";
        if (!(error instanceof JobError)) console.error(`AI site planner tool ${toolUse.name} failed`, error);
        results.push({ type: "tool_result", tool_use_id: toolUse.id, content, is_error: true });
      }
    }
    if (accepted) return accepted;
    messages.push({ role: "user", content: results });
  }
  throw new JobError("Planning didn't finish — try a smaller or more specific request.");
}

// ---------------------------------------------------------------------------------------------
// Building

function initialContent(step: PlanStep): Promise<Data> | Data {
  switch (step.kind) {
    case "create_page":
      // Parent is resolved when applying, since it may be another page this plan creates.
      return {
        root: { props: { title: step.title, alias: step.alias, parentPage: "", start: "", end: "", notes: "", og: {} } },
        content: [],
      } as Data;
    case "create_template":
      return { root: { props: { title: step.title } }, content: [{ type: "TemplateSlot", props: { id: "TemplateSlot-default" } }] } as Data;
    case "edit_page":
      return getDb()
        .select({ content: pages.content })
        .from(pages)
        .where(eq(pages.id, step.pageId))
        .limit(1)
        .then(([row]) => {
          if (!row) throw new JobError("The page no longer exists.");
          return row.content as Data;
        });
    case "edit_template":
      return getDb()
        .select({ content: templates.content })
        .from(templates)
        .where(eq(templates.id, step.templateId))
        .limit(1)
        .then(([row]) => {
          if (!row) throw new JobError("The template no longer exists.");
          return row.content as Data;
        });
    case "set_page_template":
      throw new JobError("Nothing to build.");
  }
}

// What the builder for one step is told: its part of the plan, plus the rest of the site so links
// and style line up.
function builderMessage(step: PlanStep, planned: Plan, site: { pages: PageInfo[] }): string {
  const plannedPaths = new Map<string, string>();
  const pathOfPlanned = (key: string, seen = new Set<string>()): string => {
    const known = plannedPaths.get(key);
    if (known !== undefined) return known;
    const s = planned.steps.find((p) => p.kind === "create_page" && p.key === key) as Extract<PlanStep, { kind: "create_page" }> | undefined;
    if (!s || seen.has(key)) return "";
    seen.add(key);
    const parent = s.parent === null ? "" : (site.pages.find((p) => p.id === s.parent)?.path ?? pathOfPlanned(s.parent, seen));
    const path = `${parent}/${s.alias}`;
    plannedPaths.set(key, path);
    return path;
  };
  const sitePages = [
    ...site.pages.filter((p) => p.live).map((p) => `${p.path || "/"} — ${p.title}`),
    ...planned.steps.flatMap((s) => (s.kind === "create_page" ? [`${pathOfPlanned(s.key)} — ${s.title} (being created)`] : [])),
  ];
  const what =
    step.kind === "create_page"
      ? `Build the new page “${step.title}” at ${pathOfPlanned(step.key)}. The page is empty; build its complete content.`
      : step.kind === "create_template"
        ? `Build the new template “${step.title}”. It already holds the TemplateSlot (where each page's content goes); build the shared parts around it — keep exactly one TemplateSlot.`
        : step.kind === "edit_page"
          ? "Make the changes below to this existing page."
          : "Make the changes below to this existing template. Keep exactly one TemplateSlot.";
  return [
    "You're building one part of a larger set of site changes. Work without asking questions: make sensible choices and finish the job.",
    `Overall plan: ${planned.summary}`,
    planned.designNotes ? `Shared design direction:\n${planned.designNotes}` : "",
    `Site pages (link to these by path):\n${sitePages.join("\n") || "(none yet)"}`,
    `Your task: ${what}`,
    "brief" in step ? `Brief:\n${step.brief}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function buildStep(state: JobState, index: number, planned: Plan, site: { pages: PageInfo[] }, context: BuildContext, signal: AbortSignal) {
  const jobStep = state.steps[index]!;
  const step = jobStep.step;
  const isTemplate = step.kind === "create_template" || step.kind === "edit_template";
  const label = stepKey(step) ?? ("pageId" in step ? "page" : "template");
  jobStep.status = "building";
  await state.saveSteps();
  await state.note(`Building ${describeStep(step, { pages: new Map(), templates: new Map() }).toLowerCase()}`);

  let data = await initialContent(step);
  let reply = "";
  let failure: string | undefined;
  const config = isTemplate ? context.templateConfig : context.pageConfig;
  await themeContext.run(context.theme, () =>
    runHarness({
      apiKey: context.apiKey,
      catalog: isTemplate ? context.templateCatalog : context.pageCatalog,
      config,
      disabledComponents: context.disabled,
      data,
      history: [],
      message: builderMessage(step, planned, site),
      selectedId: null,
      rootSchema: null,
      attention: [],
      attachments: [],
      userId: state.row.userId,
      signal,
      emit: (event) => {
        if (event.type === "data") data = event.data;
        else if (event.type === "text") reply = event.text;
        else if (event.type === "usage") void state.spend(event.usage.costUsd);
        else if (event.type === "status") void state.note(`${label}: ${event.text}`);
        else if (event.type === "error") failure = event.message;
      },
    }),
  );
  if (failure) throw new JobError(failure);
  jobStep.content = data;
  jobStep.note = reply;
  jobStep.status = "built";
  await state.saveSteps();
}

type BuildContext = {
  apiKey: string;
  theme: ThemeSummary;
  disabled: ReadonlySet<string>;
  pageConfig: Partial<Config>;
  templateConfig: Partial<Config>;
  pageCatalog: string;
  templateCatalog: string;
};

async function build(state: JobState, planned: Plan, apiKey: string, signal: AbortSignal): Promise<void> {
  const db = getDb();
  const [site, theme, disabled] = await Promise.all([readSite(), getTheme(db), getDisabledComponents()]);
  const summary = themeSummary(theme);
  const pageCfg = pageConfig();
  const templateCfg = templateConfig();
  // Built inside the site's theme context, so theme fields list this site's own choices.
  const [pageCatalog, templateCatalog] = themeContext.run(summary, () => [
    buildCatalog(pageCfg as Config, { disabled }),
    buildCatalog(templateCfg as Config, { disabled }),
  ]);
  const context: BuildContext = { apiKey, theme: summary, disabled, pageConfig: pageCfg, templateConfig: templateCfg, pageCatalog, templateCatalog };

  const queue = state.steps.map((_, i) => i).filter((i) => state.steps[i]!.step.kind !== "set_page_template" && state.steps[i]!.status !== "built");
  const worker = async () => {
    for (let i = queue.shift(); i !== undefined; i = queue.shift()) {
      if (signal.aborted || (await isCancelled(state.row.id))) return;
      if (state.costUsd >= budget()) throw new JobError(`Stopped: this job reached its $${budget().toFixed(2)} budget.`);
      const unavailable = await aiUnavailableReason();
      if (unavailable) throw new JobError(`Stopped: ${unavailable}`);
      try {
        await buildStep(state, i, planned, site, context, signal);
      } catch (error) {
        if (signal.aborted) return;
        const step = state.steps[i]!;
        step.status = "failed";
        step.error = jobErrorMessage(error);
        await state.saveSteps();
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(BUILD_CONCURRENCY, queue.length) }, worker));
}

// ---------------------------------------------------------------------------------------------
// Running a job

// Starts (or resumes) a job in the background. Call from inside the request's tenant context:
// the job keeps it, so everything it does is scoped to that site.
export function startJob(id: string): void {
  if (running.has(id)) return;
  const controller = new AbortController();
  running.set(id, controller);
  void runJob(id, controller.signal)
    .catch((error) => console.error("AI site job failed", error))
    .finally(() => running.delete(id));
}

async function runJob(id: string, signal: AbortSignal): Promise<void> {
  const row = await getJob(id);
  if (!row) return;
  const state = new JobState(row);
  const apiKey = process.env.CLAUDE_API_KEY?.trim();
  try {
    if (!apiKey) throw new JobError("The AI assistant isn't configured (CLAUDE_API_KEY is not set).");
    const client = new Anthropic({ apiKey, maxRetries: 2 });

    let planned = row.plan as Plan | null;
    if (!planned) {
      await state.set({ status: "planning", error: null });
      await state.note("Planning");
      const outcome = await plan(state, client, signal);
      if ("question" in outcome) {
        await state.set({ status: "clarify", error: outcome.question });
        return;
      }
      planned = outcome;
      state.steps = planned.steps.map((step) => ({ step, status: "pending" }));
      await state.set({ plan: planned, steps: state.steps });
      await state.note(`Planned ${planned.steps.length} step${planned.steps.length === 1 ? "" : "s"}`);
    }

    if (await isCancelled(id)) return;
    await state.set({ status: "building", error: null });
    await build(state, planned, apiKey, signal);
    if (signal.aborted || (await isCancelled(id))) return;
    await state.note("Ready for review");
    await state.set({ status: "review" });
  } catch (error) {
    if (signal.aborted || (await isCancelled(id))) return;
    await state.set({ status: "failed", error: jobErrorMessage(error) });
  } finally {
    await state.flush();
  }
}

export async function cancelJob(id: string): Promise<void> {
  running.get(id)?.abort();
  await getDb().update(aiJobs).set({ status: "cancelled", updatedAt: new Date() }).where(eq(aiJobs.id, id));
}

// ---------------------------------------------------------------------------------------------
// Applying

export type ApplyMode = "draft" | "publish";

// Writes the approved steps to the site. In "draft" mode new pages are created unpublished and
// existing pages get a draft holding the change; in "publish" mode both go live. Templates have
// no drafts, so template changes are saved either way (their history keeps the previous version).
// A step that fails (e.g. validation) is marked and the rest carry on; a step that depends on a
// new page or template that wasn't applied is skipped.
export async function applyJob(id: string, input: { approved: ReadonlySet<number>; mode: ApplyMode; userId: string }): Promise<void> {
  // Claimed atomically, so a double-submitted apply can't write everything twice.
  const [row] = await getDb()
    .update(aiJobs)
    .set({ status: "applying", updatedAt: new Date() })
    .where(and(eq(aiJobs.id, id), eq(aiJobs.status, "review")))
    .returning();
  if (!row) throw new JobError("This job isn't ready to apply.");
  const state = new JobState(row);

  const created = new Map<string, string>();
  const resolve = (ref: string | null) => (ref === null ? null : (created.get(ref) ?? ref));
  const isUnappliedKey = (ref: string | null) =>
    ref !== null && state.steps.some((s) => stepKey(s.step) === ref) && !created.has(ref);

  for (const index of applyOrder(state.steps.map((s) => s.step))) {
    const jobStep = state.steps[index]!;
    const step = jobStep.step;
    if (!input.approved.has(index) || jobStep.status === "applied") {
      if (jobStep.status !== "applied") jobStep.status = "skipped";
      continue;
    }
    try {
      switch (step.kind) {
        case "create_template": {
          if (!jobStep.content) throw new JobError("This step wasn't built.");
          const { template } = await saveTemplate({ content: jobStep.content, userId: input.userId });
          created.set(step.key, template.id);
          jobStep.result = { entity: "template", id: template.id };
          break;
        }
        case "edit_template": {
          if (!jobStep.content) throw new JobError("This step wasn't built.");
          await saveTemplate({ id: step.templateId, content: jobStep.content, userId: input.userId });
          jobStep.result = { entity: "template", id: step.templateId };
          break;
        }
        case "create_page": {
          if (!jobStep.content) throw new JobError("This step wasn't built.");
          if (isUnappliedKey(step.parent)) throw new JobError("Its parent page wasn't created.");
          if (step.template !== "none" && isUnappliedKey(step.template)) throw new JobError("Its template wasn't created.");
          const content = structuredClone(jobStep.content) as Data;
          const root = content.root as { props?: Record<string, unknown> };
          root.props = { ...root.props, title: step.title, alias: step.alias, parentPage: resolve(step.parent) ?? "" };
          const { page } = await savePage({
            content,
            userId: input.userId,
            state: input.mode === "publish" ? 1 : 0,
            ...(step.template === "none" ? { noTemplate: true } : step.template !== null ? { templateId: resolve(step.template) } : {}),
          });
          created.set(step.key, page.id);
          jobStep.result = { entity: "page", id: page.id };
          break;
        }
        case "edit_page": {
          if (!jobStep.content) throw new JobError("This step wasn't built.");
          if (input.mode === "publish") {
            await savePage({ id: step.pageId, content: jobStep.content, userId: input.userId });
            jobStep.result = { entity: "page", id: step.pageId };
          } else {
            const draft = await createDraftWithContent({ entityType: "page", entityId: step.pageId, name: "AI assistant", content: jobStep.content });
            jobStep.result = { entity: "page", id: step.pageId, draftId: draft.id };
          }
          break;
        }
        case "set_page_template": {
          if (isUnappliedKey(step.page)) throw new JobError("The page wasn't created.");
          if (isUnappliedKey(step.template)) throw new JobError("The template wasn't created.");
          await setPageTemplate({ pageId: resolve(step.page)!, templateId: resolve(step.template)!, userId: input.userId });
          jobStep.result = { entity: "page", id: resolve(step.page)! };
          break;
        }
      }
      jobStep.status = "applied";
      delete jobStep.error;
    } catch (error) {
      jobStep.status = "failed";
      jobStep.error = jobErrorMessage(error);
    }
  }

  const applied = state.steps.filter((s) => s.status === "applied").length;
  await state.note(`Applied ${applied} step${applied === 1 ? "" : "s"}`);
  await state.set({ steps: state.steps, status: "applied" });
  await state.flush();
}

// The built content of one step, for its preview, with the template it would be shown in.
export async function stepPreview(row: JobRow, index: number): Promise<{ page: Data; template: Data | null; templateRef: string | null } | null> {
  const steps = row.steps as JobStep[];
  const jobStep = steps[index];
  if (!jobStep?.content) return null;
  const step = jobStep.step;
  if (step.kind === "create_template" || step.kind === "edit_template") {
    return { page: { root: { props: {} }, content: [] } as Data, template: jobStep.content, templateRef: null };
  }
  let templateRef: string | null = null;
  if (step.kind === "create_page") templateRef = step.template;
  if (templateRef && templateRef !== "none") {
    const planned = steps.find((s) => stepKey(s.step) === templateRef);
    if (planned?.content) return { page: jobStep.content, template: planned.content, templateRef };
  }
  return { page: jobStep.content, template: null, templateRef };
}
