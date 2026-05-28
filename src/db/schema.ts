import { pgTable, uuid, varchar, text, integer } from "drizzle-orm/pg-core";

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