import { sql } from "drizzle-orm";
import { boolean, date, doublePrecision, index, integer, jsonb, pgPolicy, pgTable, text, timestamp, unique, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------------------------
// Tenancy
//
// One install serves any number of sites ("tenants"), each reached through one or more domains.
// Every table holding a site's own data carries a `tenant_id` and a row-level security policy
// restricting it to the tenant in the connection's `app.tenant_id` setting — which db/client.ts
// pins, per checkout, to the tenant of the request using the connection (see tenant/context.ts).
// So queries never filter on tenant_id themselves: Postgres does it, and an insert picks the
// tenant up from the column default. With no tenant set, the policy matches nothing and the
// default is NULL (rejected by NOT NULL), so code running outside a request fails closed.
//
// `drizzle-kit push` creates each policy without its USING / WITH CHECK expression (push leaves
// policy expressions out entirely) and can't set FORCE ROW LEVEL SECURITY — which the policies need
// to bind the app's role, since it owns the tables. Both are applied to the database by hand; see
// the Tenancy docs. The app's role must also not be a superuser or have BYPASSRLS.
//
// users, sessions and the tenancy tables themselves are deliberately *not* tenant-scoped: an
// account can belong to several tenants (user_tenants), and the middleware has to resolve a
// request's tenant from tenant_domains before any tenant is in context.
// ---------------------------------------------------------------------------------------------

export const currentTenantIdSql = sql`NULLIF(current_setting('app.tenant_id', true), '')::uuid`;

function tenantIdColumn() {
  return uuid("tenant_id").notNull().default(currentTenantIdSql).references(() => tenants.id);
}

function tenantIsolationPolicy() {
  return pgPolicy("tenant_isolation", {
    as: "permissive",
    for: "all",
    using: sql`tenant_id = ${currentTenantIdSql}`,
    withCheck: sql`tenant_id = ${currentTenantIdSql}`,
  });
}

export const DEFAULT_AI_MONTHLY_BUDGET_USD = 10;

export const tenants = pgTable("tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  state: integer("state").notNull().default(1), // 1 = enabled, 0 = disabled (every domain 404s)
  name: varchar("name", { length: 255 }).notNull(),
  // The opt-in Puck components (`optIn: true`, see src/puck/site-components.ts) this site may use.
  // Names this build doesn't know (e.g. from another image sharing the database) are kept as-is.
  enabledComponents: text("enabled_components").array().notNull().default(sql`'{}'::text[]`),
  // Whether this site's admins get the AI assistants (the editors' AI tab and /admin/ai), and how
  // much they may spend on them per calendar month (UTC), in USD — see puck/ai/enabled.server.ts.
  aiEnabled: boolean("ai_enabled").notNull().default(false),
  aiMonthlyBudgetUsd: doublePrecision("ai_monthly_budget_usd").notNull().default(DEFAULT_AI_MONTHLY_BUDGET_USD),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Hostnames (no scheme or port, lowercased) a tenant answers on — e.g. example.com and
// www.example.com, or blog.example.com. Exactly one row across the whole table may be the root
// domain: its tenant is the "root" tenant, where super admins manage all the others. A tenant may
// mark one of its own hostnames primary, and then its others permanently redirect to it (www →
// bare, or bare → www); with none marked, every hostname serves the site as-is. Partial unique
// indexes enforce at most one root overall and at most one primary per tenant.
export const tenantDomains = pgTable("tenant_domains", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  domain: varchar("domain", { length: 255 }).notNull().unique(),
  isRoot: boolean("is_root").notNull().default(false),
  isPrimary: boolean("is_primary").notNull().default(false),
}, (t) => [
  index("tenant_domains_tenant_id_idx").on(t.tenantId),
  uniqueIndex("tenant_domains_single_root_idx").on(t.isRoot).where(sql`${t.isRoot}`),
  uniqueIndex("tenant_domains_single_primary_idx").on(t.tenantId).where(sql`${t.isPrimary}`),
]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  // Whether the account can sign in at all, on any tenant: 1 enabled, 0 disabled, -1 deleted. Only
  // changed from the root tenant's Admin → Users, or by deleting an account that belongs to one tenant
  // alone. Enabling/disabling it on one tenant is user_tenants.state.
  state: integer("state").notNull().default(1),
  fname: varchar("fname", { length: 255 }).notNull(),
  lname: varchar("lname", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  password: text("password").notNull(),
  theme: varchar("theme", { length: 255 }).notNull().default("system"),
  // Admin access to every tenant, without needing a membership or role in it, plus the tenant
  // management screens on the root tenant. Only grantable by another super admin.
  superAdmin: boolean("super_admin").notNull().default(false),
});

// Which tenants an account belongs to. Not row-level-secured like the tenant tables below: the
// admin needs to see an account's memberships elsewhere (e.g. to tell whether it's shared before
// letting one tenant's admins change its password), so queries here filter on tenant_id by hand.
export const userTenants = pgTable("user_tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id").notNull().default(currentTenantIdSql).references(() => tenants.id, { onDelete: "cascade" }),
  // Whether the account is enabled on this tenant: 1 enabled, 0 disabled. A disabled member keeps
  // its roles but can't open this tenant's admin and isn't offered in its user pickers; the account
  // itself (users.state) and its other tenants are unaffected.
  state: integer("state").notNull().default(1),
}, (t) => [
  uniqueIndex("user_tenants_user_id_tenant_id_idx").on(t.userId, t.tenantId),
  index("user_tenants_tenant_id_idx").on(t.tenantId),
]);

export const mediafolders = pgTable("mediafolders", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: tenantIdColumn(),
  state: integer("state").notNull().default(1),
  visibility: integer("visibility").notNull().default(1),
  name: varchar("name", { length: 255 }).notNull(),
  parent: uuid("parent").references((): any => mediafolders.id),
}, (t) => [
  index("mediafolders_tenant_id_idx").on(t.tenantId),
  tenantIsolationPolicy(),
]);

export const media = pgTable("media", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: tenantIdColumn(),
  state: integer("state").notNull().default(1),
  title: varchar("title", { length: 255 }).notNull(),
  alt: varchar("alt", { length: 255 }).notNull(),
  folder: uuid("folder").references(() => mediafolders.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("media_tenant_id_idx").on(t.tenantId),
  tenantIsolationPolicy(),
]);

export const templates = pgTable("templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: tenantIdColumn(),
  state: integer("state").notNull().default(1),
  content: jsonb("content").notNull(),
}, (t) => [
  index("templates_tenant_id_idx").on(t.tenantId),
  tenantIsolationPolicy(),
]);

// A content type's own definition: the fields its items carry (see puck/content-types.ts for the
// stored shape), the URL prefix its items are published under, and how to describe one as
// schema.org structured data. Authored in /admin/settings rather than in the Puck config.
export const contentTypes = pgTable("content_types", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: tenantIdColumn(),
  state: integer("state").notNull().default(1),
  title: varchar("title", { length: 255 }).notNull(),
  baseUrl: varchar("base_url", { length: 255 }),
  fields: jsonb("fields").notNull().default([]),
  jsonld: jsonb("jsonld"),
}, (t) => [
  index("content_types_tenant_id_idx").on(t.tenantId),
  tenantIsolationPolicy(),
]);

export const pages = pgTable("pages", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: tenantIdColumn(),
  state: integer("state").notNull().default(1),
  contentType: uuid("contentType"),
  templateId: uuid("template_id").references(() => templates.id),
  noTemplate: boolean("no_template").notNull().default(false),
  content: jsonb("content").notNull(),
}, (t) => [
  index("pages_tenant_id_idx").on(t.tenantId),
  tenantIsolationPolicy(),
]);

// Keys are unique per tenant, so upserts target (tenant_id, key) — see settingsKeyTarget.
export const settings = pgTable("settings", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: tenantIdColumn(),
  key: varchar("key", { length: 255 }).notNull(),
  value: jsonb("value").notNull(),
}, (t) => [
  unique("settings_tenant_id_key_unique").on(t.tenantId, t.key),
  tenantIsolationPolicy(),
]);

// The conflict target for upserting a settings row by key.
export const settingsKeyTarget = [settings.tenantId, settings.key];

export const forms = pgTable("forms", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: tenantIdColumn(),
  state: integer("state").notNull().default(1),
  content: jsonb("content").notNull(),
}, (t) => [
  index("forms_tenant_id_idx").on(t.tenantId),
  tenantIsolationPolicy(),
]);

export const formSubmissions = pgTable("form_submissions", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: tenantIdColumn(),
  state: integer("state").notNull().default(1),
  formId: uuid("form_id").notNull().references(() => forms.id),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("form_submissions_tenant_id_idx").on(t.tenantId),
  tenantIsolationPolicy(),
]);

export const documents = pgTable("documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: tenantIdColumn(),
  state: integer("state").notNull().default(1),
  title: varchar("title", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }).notNull(),
}, (t) => [
  index("documents_tenant_id_idx").on(t.tenantId),
  tenantIsolationPolicy(),
]);

export const redirects = pgTable("redirects", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: tenantIdColumn(),
  state: integer("state").notNull().default(1),
  from: varchar("from", { length: 2048 }).notNull(),
  to: varchar("to", { length: 2048 }).notNull(),
}, (t) => [
  index("redirects_tenant_id_idx").on(t.tenantId),
  tenantIsolationPolicy(),
]);

export const tags = pgTable("tags", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: tenantIdColumn(),
  state: integer("state").notNull().default(1),
  title: varchar("title", { length: 255 }).notNull(),
  parentTag: uuid("parent_tag").references((): any => tags.id),
}, (t) => [
  index("tags_tenant_id_idx").on(t.tenantId),
  tenantIsolationPolicy(),
]);

export const roles = pgTable("roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: tenantIdColumn(),
  state: integer("state").notNull().default(1),
  title: varchar("title", { length: 255 }).notNull(),
  adminAccess: boolean("admin_access").notNull().default(false),
}, (t) => [
  index("roles_tenant_id_idx").on(t.tenantId),
  tenantIsolationPolicy(),
]);

export const userRoles = pgTable("user_roles", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: tenantIdColumn(),
  userId: uuid("user_id").notNull().references(() => users.id),
  roleId: uuid("role_id").notNull().references(() => roles.id),
}, (t) => [
  uniqueIndex("user_roles_user_id_role_id_idx").on(t.userId, t.roleId),
  index("user_roles_tenant_id_idx").on(t.tenantId),
  tenantIsolationPolicy(),
]);

export const userActions = pgTable("user_actions", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: tenantIdColumn(),
  userId: uuid("user_id").references(() => users.id),
  date: timestamp("date", { withTimezone: true }).defaultNow().notNull(),
  type: varchar("type", { length: 255 }).notNull(),
  data: jsonb("data").notNull(),
}, (t) => [
  index("user_actions_tenant_id_idx").on(t.tenantId),
  index("user_actions_type_idx").on(t.type),
  tenantIsolationPolicy(),
]);

// Message templates for audit actions, keyed by action type. Defined by code rather than by any
// tenant, so shared by all of them.
export const actionSchemas = pgTable("action_schemas", {
  id: uuid("id").defaultRandom().primaryKey(),
  type: varchar("type", { length: 255 }).notNull().unique(),
  schema: jsonb("schema").notNull(),
});

export const dagNodes = pgTable("dag_nodes", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: tenantIdColumn(),
  state: integer("state").notNull().default(1), // 1 = active, -1 = deleted
  entityType: varchar("entity_type", { length: 50 }).notNull(), // 'page' | 'template' | 'content' | 'form' | 'prefab' | 'not-found'
  entityId: uuid("entity_id").notNull(),
  parentId: uuid("parent_id").references((): any => dagNodes.id),
  content: jsonb("content").notNull(),
  nodeType: varchar("node_type", { length: 20 }).notNull().default("publish"), // 'publish' | 'draft'
  name: varchar("name", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("dag_nodes_tenant_id_idx").on(t.tenantId),
  tenantIsolationPolicy(),
]);
// One-time tokens for signing in to a tenant's admin through the root site (auth/sso.ts): the root
// issues one for an account and a tenant, the tenant's own domain redeems it once, within a minute,
// and starts a session of its own. Only a hash of the token is stored.
export const ssoTokens = pgTable("sso_tokens", {
  tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  // The root-site sign-in the token was issued under, carried into the session it's redeemed for
  // (see sessions.login_id).
  loginId: uuid("login_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (t) => [
  index("sso_tokens_login_id_idx").on(t.loginId),
  index("sso_tokens_expires_at_idx").on(t.expiresAt),
]);

// One-time tokens for resetting a forgotten password (auth/password-reset.ts): emailed as a link from
// the root site's /forgot-password and redeemed once, within the hour, at /reset-password. Accounts
// are shared across tenants, so these aren't tenant-scoped either. Only a hash of the token is stored.
export const passwordResetTokens = pgTable("password_reset_tokens", {
  tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
}, (t) => [
  index("password_reset_tokens_user_id_idx").on(t.userId),
  index("password_reset_tokens_expires_at_idx").on(t.expiresAt),
]);

// Astro session storage (see session/driver.ts). `data` is Astro's own devalue-serialized session
// map and is opaque to us; `userId`, `tenantId`, `loginId` and `expiresAt` are derived from it on
// every write so sessions can be listed and revoked per user, tenant or sign-in without
// deserializing every row. `userId` is null for anonymous sessions (e.g. flash alerts from a public
// form submission).
//
// `loginId` identifies one password sign-in on the root site: its own session there and every
// tenant session handed over from it (auth/sso.ts) share it, so signing out can end exactly that
// sign-in — on every site, but only in the browser that made it (see signOut() in auth/index.ts).
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey(),
  data: text("data").notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  loginId: uuid("login_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  // Null while any entry in the session has no ttl, i.e. the row lives until destroyed.
  expiresAt: timestamp("expires_at", { withTimezone: true }),
}, (t) => [
  index("sessions_user_id_idx").on(t.userId),
  index("sessions_tenant_id_idx").on(t.tenantId),
  index("sessions_login_id_idx").on(t.loginId),
  index("sessions_expires_at_idx").on(t.expiresAt),
]);

// A run of the AI site assistant (puck/ai/site-agent.server.ts): the author's request, the plan the
// assistant drew up, each step's outcome (including the built page/template content, held here
// until the author approves it), a progress log, and the running cost. Nothing in the site itself
// changes until the author applies the job.
export const aiJobs = pgTable("ai_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: tenantIdColumn(),
  userId: uuid("user_id").notNull(),
  // planning | building | review | applying | applied | failed | cancelled
  status: varchar("status", { length: 20 }).notNull().default("planning"),
  request: text("request").notNull(),
  plan: jsonb("plan"),
  steps: jsonb("steps").notNull().default([]),
  log: jsonb("log").notNull().default([]),
  error: text("error"),
  costUsd: doublePrecision("cost_usd").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("ai_jobs_tenant_id_idx").on(t.tenantId),
  tenantIsolationPolicy(),
]);

// What a site has spent on AI model calls, one row per calendar month (UTC; `month` is its first
// day), checked against tenants.ai_monthly_budget_usd. Every call from either assistant adds to it
// (see recordAiSpend in puck/ai/enabled.server.ts).
export const aiSpend = pgTable("ai_spend", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: tenantIdColumn(),
  month: date("month", { mode: "string" }).notNull(),
  costUsd: doublePrecision("cost_usd").notNull().default(0),
}, (t) => [
  unique("ai_spend_tenant_id_month_unique").on(t.tenantId, t.month),
  tenantIsolationPolicy(),
]);
