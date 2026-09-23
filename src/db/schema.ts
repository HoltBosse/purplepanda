import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  state: integer("state").notNull().default(1),
  fname: varchar("fname", { length: 255 }).notNull(),
  lname: varchar("lname", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: text("password").notNull(),
  theme: varchar("theme", { length: 255 }).notNull().default("system"),
});

export const mediafolders = pgTable("mediafolders", {
  id: uuid("id").defaultRandom().primaryKey(),
  state: integer("state").notNull().default(1),
  visibility: integer("visibility").notNull().default(1),
  name: varchar("name", { length: 255 }).notNull(),
  parent: uuid("parent").references((): any => mediafolders.id),
});

export const media = pgTable("media", {
  id: uuid("id").defaultRandom().primaryKey(),
  state: integer("state").notNull().default(1),
  title: varchar("title", { length: 255 }).notNull(),
  alt: varchar("alt", { length: 255 }).notNull(),
  folder: uuid("folder").references(() => mediafolders.id),
});

export const templates = pgTable("templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  state: integer("state").notNull().default(1),
  content: jsonb("content").notNull(),
});

// A content type's own definition: the fields its items carry (see puck/content-types.ts for the
// stored shape), the URL prefix its items are published under, and how to describe one as
// schema.org structured data. Authored in /admin/settings rather than in the Puck config.
export const contentTypes = pgTable("content_types", {
  id: uuid("id").defaultRandom().primaryKey(),
  state: integer("state").notNull().default(1),
  title: varchar("title", { length: 255 }).notNull(),
  baseUrl: varchar("base_url", { length: 255 }),
  fields: jsonb("fields").notNull().default([]),
  jsonld: jsonb("jsonld"),
});

export const pages = pgTable("pages", {
  id: uuid("id").defaultRandom().primaryKey(),
  state: integer("state").notNull().default(1),
  contentType: uuid("contentType"),
  templateId: uuid("template_id").references(() => templates.id),
  noTemplate: boolean("no_template").notNull().default(false),
  content: jsonb("content").notNull(),
});

export const settings = pgTable("settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: varchar("key", { length: 255 }).notNull().unique(),
  value: jsonb("value").notNull(),
});

export const forms = pgTable("forms", {
  id: uuid("id").defaultRandom().primaryKey(),
  state: integer("state").notNull().default(1),
  content: jsonb("content").notNull(),
});

export const formSubmissions = pgTable("form_submissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  state: integer("state").notNull().default(1),
  formId: uuid("form_id").notNull().references(() => forms.id),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const documents = pgTable("documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  state: integer("state").notNull().default(1),
  title: varchar("title", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull(),
});

export const redirects = pgTable("redirects", {
  id: uuid("id").defaultRandom().primaryKey(),
  state: integer("state").notNull().default(1),
  from: varchar("from", { length: 2048 }).notNull(),
  to: varchar("to", { length: 2048 }).notNull(),
});

export const tags = pgTable("tags", {
  id: uuid("id").defaultRandom().primaryKey(),
  state: integer("state").notNull().default(1),
  title: varchar("title", { length: 255 }).notNull(),
  parentTag: uuid("parent_tag").references((): any => tags.id),
});

export const roles = pgTable("roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  state: integer("state").notNull().default(1),
  title: varchar("title", { length: 255 }).notNull(),
  adminAccess: boolean("admin_access").notNull().default(false),
});

export const userRoles = pgTable("user_roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  roleId: uuid("role_id").notNull().references(() => roles.id),
}, (t) => [
  uniqueIndex("user_roles_user_id_role_id_idx").on(t.userId, t.roleId),
]);

export const userActions = pgTable("user_actions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id),
  date: timestamp("date").defaultNow().notNull(),
  type: varchar("type", { length: 255 }).notNull(),
  data: jsonb("data").notNull(),
});

export const actionSchemas = pgTable("action_schemas", {
  id: uuid("id").defaultRandom().primaryKey(),
  type: varchar("type", { length: 255 }).notNull().unique(),
  schema: jsonb("schema").notNull(),
});

export const dagNodes = pgTable("dag_nodes", {
  id: uuid("id").defaultRandom().primaryKey(),
  state: integer("state").notNull().default(1), // 1 = active, -1 = deleted
  entityType: varchar("entity_type", { length: 50 }).notNull(), // 'page' | 'template' | 'content' | 'form' | 'prefab'
  entityId: uuid("entity_id").notNull(),
  parentId: uuid("parent_id").references((): any => dagNodes.id),
  content: jsonb("content").notNull(),
  nodeType: varchar("node_type", { length: 20 }).notNull().default("publish"), // 'publish' | 'draft'
  name: varchar("name", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
// Astro session storage (see session/driver.ts). `data` is Astro's own devalue-serialized session
// map and is opaque to us; `userId` and `expiresAt` are derived from it on every write so sessions
// can be listed and revoked per user without deserializing every row. `userId` is null for
// anonymous sessions (e.g. flash alerts from a public form submission).
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey(),
  data: text("data").notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  // Null while any entry in the session has no ttl, i.e. the row lives until destroyed.
  expiresAt: timestamp("expires_at"),
}, (t) => [
  index("sessions_user_id_idx").on(t.userId),
  index("sessions_expires_at_idx").on(t.expiresAt),
]);
