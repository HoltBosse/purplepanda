import { describe, expect, it } from "vitest";
import { applyOrder, checkPlan, describeStep, type Plan, type PlanStep, planJsonSchema, planSchema } from "./site-plan.js";

const PAGE = "11111111-1111-4111-8111-111111111111";
const TEMPLATE = "22222222-2222-4222-8222-222222222222";
const site = { pageIds: new Set([PAGE]), templateIds: new Set([TEMPLATE]) };

function plan(steps: PlanStep[]): Plan {
  return { summary: "Test", designNotes: "", steps };
}

const newTemplate: PlanStep = { kind: "create_template", key: "main", title: "Main", brief: "Header and footer" };
const about: PlanStep = { kind: "create_page", key: "about", title: "About", alias: "about", parent: null, template: "main", brief: "Our story" };
const team: PlanStep = { kind: "create_page", key: "team", title: "Team", alias: "team", parent: "about", template: null, brief: "The team" };

describe("checkPlan", () => {
  it("accepts references to existing ids and to keys created in the plan, in any order", () => {
    const steps: PlanStep[] = [
      team,
      about,
      newTemplate,
      { kind: "set_page_template", page: PAGE, template: "main" },
      { kind: "edit_page", pageId: PAGE, brief: "Tweak" },
      { kind: "create_page", key: "legal", title: "Legal", alias: "legal", parent: PAGE, template: "none", brief: "Terms" },
    ];
    expect(checkPlan(plan(steps), site)).toEqual([]);
  });

  it("reports unknown references, kind mix-ups, duplicate keys and parent cycles", () => {
    const problems = checkPlan(
      plan([
        { ...about, parent: "nowhere" },
        { ...about, key: "about", alias: "again" },
        { kind: "set_page_template", page: "main", template: "about" },
        { kind: "edit_template", templateId: PAGE, brief: "x" },
        newTemplate,
        { kind: "create_page", key: "a", title: "A", alias: "a", parent: "b", template: null, brief: "x" },
        { kind: "create_page", key: "b", title: "B", alias: "b", parent: "a", template: null, brief: "x" },
      ]),
      site,
    );
    expect(problems).toEqual(
      expect.arrayContaining([
        'Key "about" is used twice.',
        'Step 1 (create_page): parent "nowhere" is neither a page id nor a page key.',
        'Step 3 (set_page_template): page "main" is neither a page id nor a page key.',
        'Step 3 (set_page_template): template "about" is neither a template id nor a template key.',
        `Step 4 (edit_template): no template with id ${PAGE}.`,
        'Page "a" ends up inside itself through its parents.',
      ]),
    );
  });
});

describe("applyOrder", () => {
  it("puts templates first, parents before children, and edits and assignments last", () => {
    const steps: PlanStep[] = [
      { kind: "set_page_template", page: "team", template: "main" },
      team,
      { kind: "edit_page", pageId: PAGE, brief: "x" },
      about,
      newTemplate,
    ];
    expect(applyOrder(steps)).toEqual([4, 3, 1, 2, 0]);
  });
});

describe("planSchema", () => {
  it("rejects aliases and keys the site can't use", () => {
    expect(planSchema.safeParse(plan([{ ...about, alias: "About Us" }])).success).toBe(false);
    expect(planSchema.safeParse(plan([{ ...about, key: "About Page" }])).success).toBe(false);
    expect(planSchema.safeParse(plan([about])).success).toBe(true);
  });

  it("is offered to the planner as a plain JSON schema", () => {
    expect(planJsonSchema).toMatchObject({ type: "object", required: expect.arrayContaining(["summary", "steps"]) });
    expect(planJsonSchema).not.toHaveProperty("$schema");
  });
});

describe("describeStep", () => {
  it("names pages and templates by title where known", () => {
    const titles = { pages: new Map([["about", "About"]]), templates: new Map([["main", "Main"]]) };
    expect(describeStep(team, titles)).toBe("Create page “Team” (/team) under “About” using the default template");
    expect(describeStep({ kind: "set_page_template", page: "about", template: "main" }, titles)).toBe("Set “About” to use template “Main”");
  });
});
