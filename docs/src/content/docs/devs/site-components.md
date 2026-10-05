---
title: Site Components
description: Components only some sites get, and keeping them in a private repository.
---

Every site on an install runs the same build, so every site has the same components. Two things
let a component belong to particular sites: marking it **opt-in**, so a site only gets it once a
super admin enables it there, and a **site module**, so its code can live in a private repository
and still be compiled into the build.

# Opt-in components

Set `optIn: true` on a component and no site can use it until it's enabled for that site:

```tsx
export const Hero: ComponentConfig<{ title: string }> = {
  label: "Acme hero",
  optIn: true,
  fields: { title: { type: "text" } },
  render: ({ title }) => <h1>{title}</h1>,
};
```

Under **Admin → Sites** on the root domain, a site's edit page lists every opt-in component in the
build (by its `label`) with a checkbox each. The names a site has enabled are stored in
`tenants.enabled_components`. Components without `optIn` are on for every site, as before.

For a site that hasn't enabled a component:

- the page, template, form, prefab and 404 editors leave it out of their component list
- every route that saves content refuses content containing it, with an error naming it — checked
  on the server, so a crafted request gets the same answer as the editor
- `/admin/components/data` won't run its `data` resolver

Turning a component off stops new uses, not old ones. Published pages that already contain it keep
rendering. Their editors still draw it, so it can be selected and removed, but the page can't be
saved again until it is.

Component names are what content stores, so give a site's components names that won't collide with
anyone else's (`AcmeHero`, not `Hero`).

# Site modules

A site module adds components, categories, plugins and font stylesheets to the build without
touching this repository:

```ts
// sites/index.ts
import { defineSite } from "../src/site/index.js";
import { Hero } from "./Hero.js";

export default defineSite({
  components: { Hero },
  categories: { Acme: { components: ["Hero"] } },
  plugins: [],
  fontFamilies: [],
});
```

Its components are added to `src/puck.config.tsx`'s (after them, so one can replace a built-in
component of the same name) and its plugins to `src/plugins.ts`'s. Components marked
`island: true` get their own front-end chunk, the same as built-in ones.

The build looks for it in this order, once when it starts (see `src/site/resolve.ts`):

1. the directory in `PURPLEPANDA_SITE_DIR`, relative to the project root. The build fails if that
   directory has no `index.ts`/`index.tsx`, rather than quietly shipping without the components.
2. `./sites`, if it has an index file. `/sites/` is gitignored.
3. nothing — `src/site/empty.ts` adds nothing, and the build is the plain public one.

Keep the directory inside the project root. Its imports (`react`, `@puckeditor/core`, `../src/…`)
resolve against the project's own `node_modules` and source from there.

Tests always use the empty module, so the public test suite doesn't depend on whatever site module
a checkout has.

# A private repository

Keep the site module in a private repository (`purplepanda-sites`, say) whose root is the module
itself (`index.ts`, the components, their tests) and which builds the image you deploy:

```dockerfile
# purplepanda-sites/Dockerfile
FROM node:22 AS build
WORKDIR /app
# The public source, pinned: bump it deliberately rather than building whatever master is.
ARG PURPLEPANDA_REF=v1.0.0
RUN git clone --depth 1 --branch "$PURPLEPANDA_REF" https://github.com/<owner>/purplepanda.git .
RUN npm ci
COPY . ./sites
# Only needed when the site module has dependencies of its own (its own package.json).
RUN if [ -f sites/package.json ]; then npm ci --prefix sites; fi
RUN npm run build

FROM node:22-slim
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
CMD ["npm", "start"]
```

For local development, check the private repository out as `sites/` in a purplepanda checkout and
run `npm run dev` as usual.

Points to watch:

- **The built image contains the components.** Astro bundles them into `dist/`, and bundled
  JavaScript is easy to read, so push the image to a private registry too.
- **So does the editor's JavaScript.** Every site's editors download every component in the build,
  enabled or not, so an admin of one site can read another site's components in the browser's
  devtools. If sites must not see each other's code, build one image per site, each with only its
  own site module, rather than one image for all of them.
- **Private packages:** if the site module depends on a private npm package, pass the registry
  token with a BuildKit secret (`RUN --mount=type=secret,id=npmrc …`), never `ARG` or `ENV`, which
  end up in the image's layers.
- **Several images, one database:** a site's enabled components are stored by name, and saving a
  site under Admin → Sites keeps any enabled names the running build doesn't know. So one image
  with site module A and another with B can share a database without unsetting each other's.
- **CI:** have the private repository's CI build the combined image and run the public suite
  (`npm test`) alongside its own tests, so an upstream change that breaks the site module fails
  there rather than at deploy.
