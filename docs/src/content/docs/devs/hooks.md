---
title: Hooks
description: Extending PurplePanda with plugins that observe events or override built-in decisions.
---

`purplePandaIntegration()` accepts a `plugins` option, letting a project observe internal events and override specific built-in decisions without forking the package. There's no central registry of hook names to keep in sync - each hook's contract (its payload/return shape) is defined at the one place in PurplePanda's own source that calls it, and is documented in the [Hook Reference](/devs/hooks-reference).

A plugin is a plain object shaped like this (importable as a type from `@holtbosse/purplepanda/hooks`):

```ts
interface PurplePandaPlugin {
  name: string;
  hooks: {
    on?: Record<string, (payload: Record<string, unknown>) => void | Promise<void>>;
    override?: Record<string, (ctx: any) => any>;
  };
}
```

## Wiring a plugin

Pass an array of plugins to the integration in `astro.config.mjs`:

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import purplePandaIntegration from "@holtbosse/purplepanda";
import { auditLogPlugin } from "./purplepanda-plugins/audit-log.js";
import { ssoOverridePlugin } from "./purplepanda-plugins/sso-override.js";

export default defineConfig({
  integrations: [
    purplePandaIntegration({
      db,
      mediaPath: "./media",
      documentPath: "./documents",
      puckConfigModule: "./src/puck/config.tsx",
      plugins: [auditLogPlugin, ssoOverridePlugin],
    }),
  ],
});
```

## Observing events (`on`)

Observe hooks are fire-and-forget: a listener never changes what PurplePanda does, only reacts after the fact. Every [action](/devs/actions-api) is automatically an observable event (named the same as its `type`), plus a few events that aren't logged as actions - see the [Hook Reference](/devs/hooks-reference) for the complete list and each one's payload shape.

```ts
// purplepanda-plugins/audit-log.js
import type { PurplePandaPlugin } from "@holtbosse/purplepanda/hooks";

export const auditLogPlugin: PurplePandaPlugin = {
  name: "audit-log",
  hooks: {
    on: {
      "content:publish": async ({ id, draftId, version }) => {
        await fetch("https://hooks.slack.com/services/...", {
          method: "POST",
          body: JSON.stringify({
            text: `Content ${id} published (draft ${draftId} -> v${version})`,
          }),
        });
      },
      "media:upload": ({ ids }) => {
        console.log(`[audit] uploaded media: ${ids.join(", ")}`);
      },
      "auth:loginFailed": ({ username }) => {
        console.warn(`[audit] failed login attempt for ${username}`);
      },
    },
  },
};
```

If a listener throws, it's caught and logged (`[purplepanda] plugin "<name>" hook "on.<event>" threw`) - it never fails the request that triggered it, since by the time an event fires the underlying action (publish, upload, ...) has already committed.

## Overriding a decision (`override`)

Override hooks let a plugin replace or add to a specific built-in decision. Each one requires the returned value to pass a Zod schema; a value that fails validation is logged and treated the same as returning `undefined`, which falls through to PurplePanda's own built-in behavior. See the [Hook Reference](/devs/hooks-reference) for each hook's exact context and schema.

Every override hook is also an observable event under the same name - its `ctx` is emitted to `on` listeners unconditionally, before any `override` handler runs. This lets a plugin watch a decision point happen without competing to make the decision:

```ts
hooks: {
  on: {
    // Fires on every admin request, regardless of what (if anything) overrides the check.
    "auth:isAdmin": ({ userId, defaultIsAdmin }) => {
      console.log(`[audit] auth:isAdmin checked for ${userId}, default=${defaultIsAdmin}`);
    },
  },
},
```

```ts
// purplepanda-plugins/sso-override.js
import type { PurplePandaPlugin } from "@holtbosse/purplepanda/hooks";
import { isCompanySsoAdmin } from "./sso-client.js";

export const ssoOverridePlugin: PurplePandaPlugin = {
  name: "sso-override",
  hooks: {
    override: {
      // auth:isAdmin expects a boolean. Returning true/false replaces the built-in
      // role check; returning undefined falls through to it.
      "auth:isAdmin": async ({ userId, defaultIsAdmin }) => {
        if (defaultIsAdmin) return true;
        return (await isCompanySsoAdmin(userId)) || undefined;
      },

      // content:validate expects an array of validation errors. Returned errors are
      // appended to PurplePanda's own validation - this can only make validation
      // stricter, never bypass it.
      "content:validate": ({ entity, contentType, content }) => {
        if (entity !== "page") return undefined;
        const title = (content as any)?.root?.props?.title;
        if (typeof title === "string" && title.length > 60) {
          return [
            {
              componentId: "root",
              componentType: "Page",
              field: "title",
              message: "Title must be 60 characters or fewer for SEO.",
            },
          ];
        }
        return undefined;
      },
    },
  },
};
```

## Multiple plugins

Plugins run in the array order passed to `plugins`. For an `on` event, every plugin's matching listener runs. For an `override` hook, plugins are tried in order and the first one to return a schema-valid, non-`undefined` value wins - later plugins (and PurplePanda's own built-in default) are skipped.
