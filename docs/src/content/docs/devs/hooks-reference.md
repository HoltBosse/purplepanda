---
title: Hook Reference
description: Every action, observe event, and override hook PurplePanda exposes to plugins.
---

The complete list of names a [plugin](/devs/hooks) can use in `hooks.on` and `hooks.override`, current as of this version. All names follow a `domain:event` convention.

## Actions

Logged via [`addAction`](/devs/actions-api) - persisted to the audit log (`/admin/audit`) and automatically observable via `on`, since `addAction` emits the same name it logs.

| Name | Payload | Fired from |
| --- | --- | --- |
| `auth:login` | `{ method: string }` | Successful admin login |
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
| `redirect:create` | `{ id: string }` | New redirect saved |
| `redirect:update` | `{ id: string }` | Existing redirect saved |
| `template:create` | `{ id: string, version: string \| null }` | New template saved |
| `template:update` | `{ id: string, version: string \| null }` | Existing template saved |

## Observe-only events

Fire via `on` like actions above, but aren't logged to the audit trail.

| Name | Payload | Fired from |
| --- | --- | --- |
| `auth:loginFailed` | `{ username: string }` | Login attempt with a bad username or password |
| `auth:logout` | `{ userId: string }` | Admin logout |
| `form:submitted` | `{ formId: string, data: Record<string, unknown> }` | A public-facing form submission is accepted (after spam/CSRF checks pass) |

## Override hooks

Registered via `hooks.override`. A returned value must pass the listed schema or it's ignored (logged, then treated as `undefined`). Each of these is also an observable event under the same name — `ctx` is emitted to `on` listeners unconditionally, before any `override` handler is consulted, so a plugin can watch the decision point without competing to make it.

| Name | Context (`ctx`) | Expected return | Behavior |
| --- | --- | --- | --- |
| `auth:isAdmin` | `{ userId: string, defaultIsAdmin: boolean }` | `boolean` | Replaces PurplePanda's built-in admin role check. Runs on every `/admin/*` request via the auth middleware. |
| `content:validate` | `{ entity: "page" \| "content" \| "form" \| "template" \| "prefab", contentType?: string, content: unknown }` | `ContentValidationError[]` (`{ componentId, componentType, field, message }[]`) | Additive - returned errors are appended to PurplePanda's own Puck content validation on every save/publish. Can only make validation stricter, never bypass it. |

See [Hooks](/devs/hooks) for wiring and example plugins.
