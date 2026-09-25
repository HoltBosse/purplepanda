---
title: Hook Reference
description: Every action, observe event, and override hook PurplePanda exposes to plugins.
---

The complete list of names a [plugin](/devs/hooks) can use in `hooks.on` and `hooks.override`, current as of this version. All names follow a `domain:event` convention.

Every hook runs inside the request of the [tenant](/devs/tenancy) (site) it happened on, so any query a plugin makes through `getDb()` is automatically limited to that tenant. `getTenant()` from `src/tenant/context.ts` tells a plugin which one it is.

## Actions

Logged via [`addAction`](/devs/actions-api) - persisted to the audit log (`/admin/audit`) and automatically observable via `on`, since `addAction` emits the same name it logs.

| Name | Payload | Fired from |
| --- | --- | --- |
| `auth:login` | `{ method: "password" \| "sso" }` | Sign-in on the root site's `/login` (`password`), or a site's admin being entered through it (`sso`) |
| `content:create` | `{ id: string, version: string \| null }` | New content item saved |
| `content:update` | `{ id: string, version: string \| null }` | Existing content item saved |
| `content:publish` | `{ id: string, draftId: string, version: string \| null }` | Content draft published |
| `document:create` | `{ id: string }` | Document uploaded |
| `document:update` | `{ id: string }` | Document metadata updated |
| `form:create` | `{ id: string, version: string \| null }` | New form saved |
| `form:update` | `{ id: string, version: string \| null }` | Existing form saved |
| `media:upload` | `{ ids: string[] }` | Media file(s) uploaded |
| `media:update` | `{ ids: string[] }` | Media metadata updated |
| `media:move` | `{ id: string, oldFolderId: string \| null, newFolderId: string \| null }` | Media moved between folders |
| `page:create` | `{ id: string, version: string \| null }` | New page saved |
| `page:update` | `{ id: string, version: string \| null }` | Existing page saved |
| `page:publish` | `{ id: string, draftId: string, version: string \| null }` | Page draft published |
| `prefab:create` | `{ id: string, version: string \| null }` | New prefab saved |
| `prefab:update` | `{ id: string, version: string \| null }` | Existing prefab saved |
| `not-found:create` | `{ id: string, version: string \| null }` | Custom 404 page saved for the first time |
| `not-found:update` | `{ id: string, version: string \| null }` | Existing custom 404 page saved |
| `redirect:create` | `{ id: string }` | New redirect saved |
| `redirect:update` | `{ id: string }` | Existing redirect saved |
| `template:create` | `{ id: string, version: string \| null }` | New template saved |
| `template:update` | `{ id: string, version: string \| null }` | Existing template saved |
| `tenant:create` | `{ id: string }` | New site created (root site only) |
| `tenant:update` | `{ id: string }` | Site name, domains or root domain changed (root site only) |
| `tenant:enable` | `{ id: string }` | Site enabled (root site only) |
| `tenant:disable` | `{ id: string }` | Site disabled (root site only) |
| `user:superAdminGrant` | `{ id: string }` | Super admin granted to an account (root site only) |
| `user:superAdminRevoke` | `{ id: string }` | Super admin revoked from an account (root site only) |
| `user:enable` | `{ id: string }` | An account enabled on every site from Admin → Users (root site only) |
| `user:disable` | `{ id: string }` | An account disabled on every site from Admin → Users (root site only) |
| `user:delete` | `{ id: string }` | An account deleted (every site) with bulk delete in Admin → Users (root site only) |
| `user:siteAdd` | `{ id: string, site: string }` | An account added to a site from Admin → Users (root site only) |
| `user:siteRemove` | `{ id: string, site: string }` | An account removed from a site from Admin → Users (root site only) |

## Observe-only events

Fire via `on` like actions above, but aren't logged to the audit trail.

| Name | Payload | Fired from |
| --- | --- | --- |
| `auth:loginFailed` | `{ username: string, tenantId: string }` | Login attempt with a bad username or password, or by an account without access to this tenant |
| `auth:logout` | `{ userId: string }` | Sign-out (from any site, which ends that browser's sign-in on every site) |
| `form:submitted` | `{ formId: string, data: Record<string, unknown> }` | A public-facing form submission is accepted (after spam/CSRF checks pass) |

## Override hooks

Registered via `hooks.override`. A returned value must pass the listed schema or it's ignored (logged, then treated as `undefined`). Each of these is also an observable event under the same name — `ctx` is emitted to `on` listeners unconditionally, before any `override` handler is consulted, so a plugin can watch the decision point without competing to make it.

| Name | Context (`ctx`) | Expected return | Behavior |
| --- | --- | --- | --- |
| `auth:isAdmin` | `{ userId: string, tenantId: string, defaultIsAdmin: boolean }` | `boolean` | Replaces PurplePanda's built-in admin role check for the current tenant (super admin, or a member with an admin-access role). Runs on every `/admin/*` request via the auth middleware, after the session has been checked to belong to this tenant. |
| `content:validate` | `{ entity: "page" \| "content" \| "form" \| "template" \| "prefab" \| "not-found", contentType?: string, content: unknown }` | `ContentValidationError[]` (`{ componentId, componentType, field, message }[]`) | Additive - returned errors are appended to PurplePanda's own Puck content validation on every save/publish. Can only make validation stricter, never bypass it. |
| `admin:nav` | `{ user: User, defaultNavItems: NavItem[] }` | `NavItem[]` (`{ id, label, icon, href?, subItems?: { label, href }[] }[]`) | Replaces the admin nav rail + drawer panels entirely. Return a modified copy of `defaultNavItems` to reorder/relabel/add/remove items rather than rebuilding the whole nav from scratch. `icon` must be a Lucide Astro component (e.g. `import { Settings } from "@lucide/astro"`) - any value that isn't a function fails the schema. Runs on every `/admin/*` page render (`AdminLayout.astro`); the user avatar dropdown isn't part of this hook. |

See [Hooks](/devs/hooks) for wiring and example plugins.
