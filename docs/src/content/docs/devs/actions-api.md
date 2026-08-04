---
title: Actions API
description: Logging user actions for the audit trail.
---

The actions API (`src/actions/index.ts`) records user activity for the audit log (`/admin/audit`). Each entry is a `type` (e.g. `pagecreate`) plus a `payload`, rendered into a human-readable message using a template stored per-type.

## addAction

```ts
import { addAction } from "../../../actions/index.js";

await addAction(
  "pageupdate",
  { id: page.id, version: publishNode?.id ?? null },
  userId,
  {
    message: "Page {id} was updated",
    placeholders: {
      id: { lookupColumn: pages.id, displayColumn: pages.content, displayPath: ["root", "props", "title"] },
    },
  },
);
```

* `type`: string identifying the kind of action, e.g. `"pagecreate"`, `"mediamove"`.
* `payload`: an object of data to store with the action. Keys referenced by `message` placeholders (`{key}`) should exist here.
* `userId`: the id of the user who performed the action.
* `options.message`: a template string with `{key}` placeholders filled in from `payload` (or resolved via `placeholders`, see below).
* `options.placeholders` (optional): for a given payload key, look up a display value instead of showing the raw payload value. Each entry has:
  * `lookupColumn`: the column to match the payload value against (e.g. `pages.id`).
  * `displayColumn`: the column to show instead (e.g. `pages.content`).
  * `displayPath` (optional): if `displayColumn` is jsonb and the display value is nested inside it (e.g. Puck's `content.root.props.title`), the path to it.

The `message`/`placeholders` schema is upserted once per `type` (in `actionSchemas`); the `payload` is inserted as a new row per call (in `userActions`).

## describeAction

```ts
import { describeAction } from "../../../actions/index.js";

const text = await describeAction({ type: action.type, data: action.data });
```

Given a `userActions` row's `type` and `data`, looks up the stored schema for that `type` and renders `message`, resolving any `placeholders` against the current database state. If no schema is found for `type`, returns `type` as-is.
