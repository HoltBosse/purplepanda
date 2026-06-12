import { pgTable, uuid, varchar, text, integer, jsonb } from "drizzle-orm/pg-core";

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