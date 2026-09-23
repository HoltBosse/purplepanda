---
title: Installation
description: How to set up a purplepanda site.
---

PurplePanda is the Astro project itself, not a package you add to one: clone the repo and the CMS,
its admin UI, and your site's own pages all live in the same `src/`.

# Requirements

1. Node 22.12 or newer
2. A PostgreSQL database
3. A place to keep uploaded media and documents (`./media` and `./documents` by default)

# Setup

```sh
npm install
cp .env.example .env   # then set DATABASE_URL
npx drizzle-kit push   # create the schema
npm run dev
```

`.env` holds the runtime configuration:

* `DATABASE_URL` - the Postgres connection string (required)
* `MEDIA_PATH` - absolute path for uploaded media. Defaults to `./media` under the project root
* `DOCUMENT_PATH` - absolute path for uploaded documents. Defaults to `./documents`

Override the two paths when a deployment keeps uploads on a mounted volume, or starts the server
from somewhere other than the project root.

# Where things live

| Path | What it is |
| --- | --- |
| `src/puck.config.tsx` | Your [Puck Editor](https://puckeditor.com/docs/api-reference/configuration/config) config - the components your site offers |
| `src/db/client.ts` | The drizzle db instance (the Postgres pool) |
| `src/db/schema.ts` | The schema, shared by the CMS and your own tables |
| `src/plugins.ts` | Your [plugins](/devs/hooks), if any |
| `src/pages/` | File-based routes. `src/pages/admin/` is the CMS admin UI; `src/pages/[...path].astro` renders published pages |
| `public/admin/assets/` | Admin chrome (favicons, logo) |

# Building and running

```sh
npm run build                 # produces dist/
npm start                     # node dist/server/entry.mjs
npm run start:cluster         # the same build under PM2, one worker per core
```
