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
* `db`: drizzle orm db instance
* `mediaPath`: a place where PurplePanda can store media assets
* `documentPath`: a place where PurplePanda can store documents
* `puckConfigModule`: path to your [Puck Editor](https://puckeditor.com/docs/api-reference/configuration/config) file

## Sample

```js
integrations: [
    purplePandaIntegration({
      enabled: true,
      db: db,
      mediaPath: fs.realpathSync('./media/'),
      documentPath: fs.realpathSync('./documents/'),
      puckConfigModule: './src/puck/config.tsx',
    }),
    react()
  ],
```
