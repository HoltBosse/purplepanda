---
title: Installation
description: How to set up a purplepanda site.
---

# Requirements

1. [Astro react integration](https://docs.astro.build/en/guides/integrations-guide/react/)
2. [Drizzle orm](https://orm.drizzle.team/)

# Drizzle orm configuration

you need to include this in it `schema: ['./src/db/schema.ts', '../../node_modules/@holtbosse/purplepanda/dist/db/schema.js'],`

# Your astro.config.mjs file

## options

* `enabled`: boolean
* `dbModule`: path to a module (relative to your project root, or a bare specifier) whose default export is your drizzle orm db instance
* `mediaPath`: a place where PurplePanda can store media assets
* `documentPath`: a place where PurplePanda can store documents
* `puckConfigModule`: path to your [Puck Editor](https://puckeditor.com/docs/api-reference/configuration/config) file

`dbModule` takes a path rather than the db instance itself so that the real `import` ends up bundled into your built server output — that's what lets a production build (`node dist/server/entry.mjs`, as PM2/Docker/systemd would run it) construct the db connection on its own, without needing `astro.config.mjs` to run first.

## Sample

```js
// src/db/index.js
import { drizzle } from 'drizzle-orm/node-postgres';

const db = drizzle(process.env.DATABASE_URL);

export default db;
```

```js
// astro.config.mjs
integrations: [
    purplePandaIntegration({
      enabled: true,
      dbModule: './src/db/index.js',
      mediaPath: fs.realpathSync('./media/'),
      documentPath: fs.realpathSync('./documents/'),
      puckConfigModule: './src/puck/config.tsx',
    }),
    react()
  ],
```
