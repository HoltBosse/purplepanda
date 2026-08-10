---
title: Content Types
description: Configuring a content type.
---

In your Puck config, `contentTypes` should exist as a top level key if you want to create a content type.

Each content type should consist of the following:
* `id`: a uuid for the content type
* `title`: what the content type should be called
* `fields`: puck root page fields
* `baseUrl` (optional): a path prefix (e.g. `/articles`) under which content items of this type are publicly routable. A request to `{baseUrl}/{alias}` will render the content item whose `alias` field matches and whose content type matches.
* `jsonLd` (optional): builds this content type's [structured data](https://schema.org/) for search engines. See below.

## Structured data (JSON-LD)

`jsonLd` is a function that takes a content item's resolved root props (i.e. its `fields` values) and returns a [schema.org](https://schema.org/) object describing it - typed as `Thing` from the [`schema-dts`](https://www.npmjs.com/package/schema-dts) package, which PurplePanda already depends on. Import a narrower type (`Article`, `Product`, etc.) instead of `Thing` for full property checking against that type's shape.

```js
{
  id: "00000000-0000-0000-0000-000000000000",
  title: "Article",
  fields: {
    title: { type: "text" },
    alias: { type: "text" },
    description: { type: "text" },
    body: { type: "richtext" },
  },
  baseUrl: "/articles",
  jsonLd: (props) => ({
    "@type": "Article",
    headline: props.title,
    description: props.description,
  }),
}
```

On a matching route, PurplePanda calls `jsonLd`, adds `"@context": "https://schema.org"`, and serializes the result into a `<script type="application/ld+json">` tag in the page's `<head>`. Content types without a `jsonLd` function emit no structured data of their own. `jsonLd` is only called for content-type routes (pages with a `baseUrl`) - plain pages don't have a content type to look one up on.

### Breadcrumbs

Every page - content-type or plain - automatically gets a `BreadcrumbList` added alongside its own structured data (merged into the same `<script>` tag via `@graph` when both are present). The trail always starts with "Home" and ends with the current page, and each crumb's name is a page's own resolved `title` prop rather than its URL slug:

* On a content-type route (e.g. `/articles/my-post`), the trail is Home → *content type's `title`* (linking to its `baseUrl`) → the item's own `title` prop, since there's no real page behind the `baseUrl` prefix itself.
* On a plain page, the trail follows the page's `parentPage` ancestry, using each ancestor page's own `title` prop.

Breadcrumbs aren't added for the homepage.

