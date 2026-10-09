import type { Data } from "@puckeditor/core";
import { and, count, desc, eq, getTableColumns, type InferSelectModel } from "drizzle-orm";
import * as z from "zod";
import { addAction } from "../audit/index.js";
import { MAX_DRAFTS_PER_ENTITY } from "../dag/index.js";
import { invalidatePagesCache, invalidateTemplatesCache } from "../db/content-cache.js";
import { entityKindFilter } from "../db/content-types.js";
import { getDb } from "../db/db.js";
import { dagNodes, pages, templates } from "../db/schema.js";
import { runOverride } from "../hooks/index.js";
import { pageRootPropsSchema } from "../puck/page-root-schema.js";
import { getDisabledComponents } from "../puck/site-components.server.js";
import { type ContentValidationError, contentValidationErrorsSchema, formatValidationErrors, validateContentTree } from "../puck/validate-content.js";
import externalPuckConfig from "../puck.config.js";

// Writes to pages and templates, shared by the admin's form routes and the AI site assistant
// (puck/ai/site-agent.server.ts), so both go through the same validation, version history, cache
// invalidation and audit trail. Callers run inside a tenant context (see tenant/context.ts) like
// any other query, and turn the errors below into their own responses.

export class NotFoundError extends Error {}

export class ContentValidationFailed extends Error {
  constructor(readonly errors: ContentValidationError[]) {
    super(formatValidationErrors(errors));
  }
}

export class DraftLimitReached extends Error {
  constructor() {
    super(`Draft limit reached (max ${MAX_DRAFTS_PER_ENTITY}). Delete an existing draft first.`);
  }
}

type Page = InferSelectModel<typeof pages>;
type Template = InferSelectModel<typeof templates>;
type EntityType = "page" | "template";

// The checks every save runs: each component's own propsSchema, the page settings schema (pages
// only), components this site has turned off, and any plugin's content:validate override.
export async function validateEntityContent(entity: EntityType, content: Data): Promise<ContentValidationError[]> {
  const errors = validateContentTree(externalPuckConfig ?? {}, content, {
    ...(entity === "page" ? { rootPropsSchema: pageRootPropsSchema } : {}),
    disabledComponents: await getDisabledComponents(),
  });
  const overrideErrors = await runOverride("content:validate", { entity, content }, contentValidationErrorsSchema);
  if (overrideErrors) errors.push(...overrideErrors);
  return errors;
}

async function assertValid(entity: EntityType, content: Data): Promise<void> {
  const errors = await validateEntityContent(entity, content);
  if (errors.length > 0) throw new ContentValidationFailed(errors);
}

// A row built from the table's column defaults, for an insert.
function rowFromDefaults<TRow>(table: typeof pages | typeof templates): TRow {
  return Object.fromEntries(
    Object.entries(getTableColumns(table)).map(([key, col]: [string, any]) => {
      let value: unknown;
      if (col.defaultFn !== undefined) value = col.defaultFn();
      else if (col.default !== undefined) value = col.default;
      else if (!col.notNull) value = null;
      else if (col.dataType === "number") value = 0;
      else value = "";
      return [key, value];
    }),
  ) as TRow;
}

// Appends a publish node to the entity's history, after its latest one.
async function recordPublish(entityType: EntityType, entityId: string, content: Data) {
  const db = getDb();
  const [latest] = await db
    .select({ id: dagNodes.id })
    .from(dagNodes)
    .where(and(eq(dagNodes.entityType, entityType), eq(dagNodes.entityId, entityId), eq(dagNodes.nodeType, "publish")))
    .orderBy(desc(dagNodes.createdAt))
    .limit(1);
  const [node] = await db
    .insert(dagNodes)
    .values({ entityType, entityId, parentId: latest?.id ?? null, content, nodeType: "publish" })
    .returning();
  return node;
}

// Looked up rather than trusted: foreign-key checks ignore row-level security, so an unchecked id
// could pin another tenant's template (or fail the insert outright).
async function liveTemplateId(templateId: string): Promise<string | null> {
  if (!z.uuid().safeParse(templateId).success) return null;
  const [template] = await getDb()
    .select({ id: templates.id })
    .from(templates)
    .where(and(eq(templates.id, templateId), eq(templates.state, 1)))
    .limit(1);
  return template?.id ?? null;
}

export type SavePageInput = {
  // Omitted to create a page.
  id?: string | undefined;
  content: Data;
  userId: string;
  // New pages only: 1 is live, 0 is committed but not live (see PagePuckEditor's Commit).
  state?: 0 | 1;
  // New pages only. Absent leaves both at their defaults: inherit the resolved default template.
  templateId?: string | null | undefined;
  noTemplate?: boolean | undefined;
};

export async function savePage(input: SavePageInput): Promise<{ page: Page; created: boolean }> {
  const db = getDb();
  let page: Page | undefined;
  if (input.id) {
    [page] = await db.select().from(pages).where(and(eq(pages.id, input.id), entityKindFilter(null))).limit(1);
    if (!page) throw new NotFoundError("Page not found");
  }

  await assertValid("page", input.content);

  const created = !page;
  if (!page) {
    page = rowFromDefaults<Page>(pages);
    page.content = input.content;
    page.state = input.state ?? 1;
    if (input.templateId !== undefined) page.templateId = input.templateId ? await liveTemplateId(input.templateId) : null;
    if (input.noTemplate !== undefined) page.noTemplate = input.noTemplate;
    // `page` came from column defaults, so its id is drizzle's gen_random_uuid() expression rather
    // than a real id. Adopt the row Postgres actually inserted — otherwise that expression gets
    // re-evaluated into an unrelated uuid for the publish node and the audit entry.
    const [inserted] = await db.insert(pages).values(page).returning();
    if (!inserted) throw new Error("Failed to insert page");
    page = inserted;
  } else {
    await db.update(pages).set({ content: input.content }).where(eq(pages.id, page.id));
    page = { ...page, content: input.content };
  }
  invalidatePagesCache(db);

  const node = await recordPublish("page", page.id, input.content);
  await addAction(created ? "page:create" : "page:update", { id: page.id, version: node?.id ?? null }, input.userId, {
    message: created ? "Page {id} was created" : "Page {id} was updated",
    placeholders: {
      id: { lookupColumn: pages.id, displayColumn: pages.content, displayPath: ["root", "props", "title"] },
    },
  });
  return { page, created };
}

export async function saveTemplate(input: { id?: string | undefined; content: Data; userId: string }): Promise<{ template: Template; created: boolean }> {
  const db = getDb();
  let template: Template | undefined;
  if (input.id) {
    [template] = await db.select().from(templates).where(eq(templates.id, input.id)).limit(1);
    if (!template) throw new NotFoundError("Template not found");
  }

  await assertValid("template", input.content);

  const created = !template;
  if (!template) {
    template = rowFromDefaults<Template>(templates);
    template.content = input.content;
    template.state = 1;
    const [inserted] = await db.insert(templates).values(template).returning();
    if (!inserted) throw new Error("Failed to insert template");
    template = inserted;
  } else {
    await db.update(templates).set({ content: input.content }).where(eq(templates.id, template.id));
    template = { ...template, content: input.content };
  }
  invalidateTemplatesCache(db);

  const node = await recordPublish("template", template.id, input.content);
  await addAction(created ? "template:create" : "template:update", { id: template.id, version: node?.id ?? null }, input.userId, {
    message: created ? "Template {id} was created" : "Template {id} was updated",
    placeholders: {
      id: { lookupColumn: templates.id, displayColumn: templates.content, displayPath: ["root", "props", "title"] },
    },
  });
  return { template, created };
}

// Pins a plain page to a template. A specific template replaces any earlier "no template" choice.
export async function setPageTemplate(input: { pageId: string; templateId: string; userId: string }): Promise<void> {
  const db = getDb();
  const [page] = await db.select({ id: pages.id }).from(pages).where(and(eq(pages.id, input.pageId), entityKindFilter(null))).limit(1);
  if (!page) throw new NotFoundError("Page not found");
  const templateId = await liveTemplateId(input.templateId);
  if (!templateId) throw new NotFoundError("Template not found");

  await db.update(pages).set({ templateId, noTemplate: false }).where(eq(pages.id, page.id));
  invalidatePagesCache(db);
  await addAction("page:template", { id: page.id, template: templateId }, input.userId, {
    message: "Page {id} now uses template {template}",
    placeholders: {
      id: { lookupColumn: pages.id, displayColumn: pages.content, displayPath: ["root", "props", "title"] },
      template: { lookupColumn: templates.id, displayColumn: templates.content, displayPath: ["root", "props", "title"] },
    },
  });
}

// A new draft of an existing plain page or template holding `content`, branched off its latest
// publish — the same thing as creating a draft and then saving it, in one step. Validated like a
// draft save, so it can be published as-is later.
export async function createDraftWithContent(input: {
  entityType: EntityType;
  entityId: string;
  name: string;
  content: Data;
}): Promise<{ id: string }> {
  const db = getDb();
  if (input.entityType === "page") {
    const [page] = await db.select({ id: pages.id }).from(pages).where(and(eq(pages.id, input.entityId), entityKindFilter(null))).limit(1);
    if (!page) throw new NotFoundError("Page not found");
  } else {
    const [template] = await db.select({ id: templates.id }).from(templates).where(eq(templates.id, input.entityId)).limit(1);
    if (!template) throw new NotFoundError("Template not found");
  }

  await assertValid(input.entityType, input.content);

  const active = await db
    .select({ count: count() })
    .from(dagNodes)
    .where(and(eq(dagNodes.entityType, input.entityType), eq(dagNodes.entityId, input.entityId), eq(dagNodes.nodeType, "draft"), eq(dagNodes.state, 1)))
    .then((rows) => rows[0]?.count ?? 0);
  if (active >= MAX_DRAFTS_PER_ENTITY) throw new DraftLimitReached();

  const [latest] = await db
    .select({ id: dagNodes.id })
    .from(dagNodes)
    .where(and(eq(dagNodes.entityType, input.entityType), eq(dagNodes.entityId, input.entityId), eq(dagNodes.nodeType, "publish")))
    .orderBy(desc(dagNodes.createdAt))
    .limit(1);

  const [draft] = await db
    .insert(dagNodes)
    .values({
      entityType: input.entityType,
      entityId: input.entityId,
      parentId: latest?.id ?? null,
      content: input.content,
      nodeType: "draft",
      // The draft name column the admin offers is capped at 20 characters (see drafts/create.ts).
      name: input.name.slice(0, 20),
    })
    .returning({ id: dagNodes.id });
  if (!draft) throw new Error("Failed to create draft");
  return draft;
}
