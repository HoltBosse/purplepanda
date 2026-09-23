![Purple Panda CMS](public/admin/assets/purple-panda-logo.png)

> [!WARNING]
> This project is in active dev, and is subject to all sorts of changes. Nothing is stable

A CMS built as an Astro app. The admin UI, the published front end, and your own site pages are
one project: `src/pages/admin/` is the CMS, `src/pages/[...path].astro` renders published pages,
and `src/puck.config.tsx` declares the components and content types editors get.

Requirements:
* Node 22.12+
* PostgreSQL

```sh
npm install
cp .env.example .env   # set DATABASE_URL
npx drizzle-kit push
npm run dev
```

See [docs/](docs/) — or https://purplepanda.holtbosse.com — for more details.
