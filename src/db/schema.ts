import { pgTable, uuid, varchar, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  state: integer("state").notNull().default(1),
  fname: varchar("fname", { length: 255 }).notNull(),
  lname: varchar("lname", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: text("password").notNull(),
});

export const mediafolders = pgTable("mediafolders", {
  id: uuid("id").defaultRandom().primaryKey(),
  state: integer("state").notNull().default(1),
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

//todo: add nullable content type field once content types are a thing
export const pages = pgTable("pages", {
  id: uuid("id").defaultRandom().primaryKey(),
  state: integer("state").notNull().default(1),
  contentType: uuid("contentType"),
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

export const dagNodes = pgTable("dag_nodes", {
  id: uuid("id").defaultRandom().primaryKey(),
  state: integer("state").notNull().default(1), // 1 = active, -1 = deleted
  entityType: varchar("entity_type", { length: 50 }).notNull(), // 'page' | 'template'
  entityId: uuid("entity_id").notNull(),
  parentId: uuid("parent_id").references((): any => dagNodes.id),
  content: jsonb("content").notNull(),
  nodeType: varchar("node_type", { length: 20 }).notNull().default("publish"), // 'publish' | 'draft'
  name: varchar("name", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});