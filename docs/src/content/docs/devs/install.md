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
* `STORAGE_DRIVER` - where uploaded media and documents are stored: `filesystem` (the default),
  `s3` or `memory`. See [Upload storage](#upload-storage)
* `CLAUDE_API_KEY` - an Anthropic API key for the editors' AI tab and the site assistant (optional).
  See [AI Assistant](/devs/ai-assistant)
* `PEXELS_API_KEY` - lets the AI assistants use free Pexels stock photos (optional)
* `AI_JOB_BUDGET_USD` - the most one site-assistant job may spend, in US dollars (default `1`)

## Upload storage

Uploads go through [flystorage](https://flystorage.dev), so the backend is picked with
`STORAGE_DRIVER`. Each file is stored under its id as `cc/cc/<id>` on every driver, so moving a
filesystem deployment onto a bucket is a plain copy of the `media/` and `documents/` trees. The
server logs which driver it is using on startup.

### `filesystem` (default)

* `MEDIA_PATH` - absolute path for uploaded media. Defaults to `./media` under the project root
* `DOCUMENT_PATH` - absolute path for uploaded documents. Defaults to `./documents`

Override the two paths when a deployment keeps uploads on a mounted volume, or starts the server
from somewhere other than the project root.

### `s3` (object storage)

Any S3-compatible store works. It was built against [RustFS](https://rustfs.com). Media and
documents share one bucket, under the `media/` and `documents/` prefixes.

* `S3_BUCKET` - the bucket (required). It must already exist
* `S3_ENDPOINT` - the endpoint URL, e.g. `http://localhost:9000` for a local RustFS. Leave unset
  for AWS
* `S3_REGION` - defaults to `us-east-1`
* `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` - credentials. Leave both unset to use the AWS SDK's
  default chain (`AWS_*` env vars, instance roles, ...)
* `S3_PREFIX` - optional key prefix, so several deployments can share a bucket
* `S3_FORCE_PATH_STYLE` - defaults to `true` (`http://host/bucket/key`), which is what RustFS and
  most self-hosted stores serve. Set it to `false` for virtual-hosted-style endpoints

### `memory`

Keeps uploads in process memory. They are **lost on every restart**, and each PM2 worker has its
own copy, so a file uploaded on one worker is missing on the others. It is only meant for tests and
throwaway demos, and the server prints a large warning on startup when it is in use.

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
