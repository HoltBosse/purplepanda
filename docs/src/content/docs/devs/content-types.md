---
title: Content Types
description: Creating and configuring a content type.
---

Content types live in the database, and are created from **Settings → Content Types** in the admin (`/admin/settings`). Each one gets its own entry under **Content** in the admin nav, its own list of items, and - if it's given a base URL - its own public routes.

## Editing and deleting

Each content type in **Settings → Content Types** has **Edit** and **Delete** actions.

Editing reopens the builder with everything filled in. A saved field's name can't be changed, since every item stores that field's value under it - to rename one, add a new field and remove the old. Removing a field leaves its value on existing items, but it stops appearing in the editor. Changing the base URL moves where the type's items are published; the sitemap and routing follow immediately.

Two content types can't share a base URL, since whichever was matched first would claim every `{baseUrl}/{alias}` request. Only an exact match collides - `/news` and `/news/articles` can coexist, because an alias is always a single path segment.

Deleting is a soft delete: the content type's `state` becomes `-1` and its items are left untouched in the database. From then on the type and its items are gone from everywhere - the **Content** nav and item lists, the item editor, drafts and previews, public `{baseUrl}/{alias}` routes (which 404, and free the base URL for reuse), the sitemap, and any `CardCollection` or content-sourced form `Select` that pointed at it. Setting `state` back to `1` would restore all of it as it was.

A content type consists of:
* `id`: a uuid, assigned when it's created
* `title`: what the content type is called
* `fields`: the fields its items carry, beyond the ones every item already has (see below)
* `baseUrl` (optional): a path prefix (e.g. `/articles`) under which items of this type are publicly routable. A request to `{baseUrl}/{alias}` renders the item whose `alias` field matches and whose content type matches.
* `jsonld` (optional): the [structured data](https://schema.org/) items of this type describe themselves with. See below.

## Fields

Every content item already has a title, an alias, a start/end scheduling window, a notes field and an Open Graph group, so those names are reserved: `title`, `alias`, `start`, `end`, `notes`, `og`, `id`, `parentPage`. The fields you define are added between the alias and the scheduling window in the editor's page panel.

Each field has a label, a name (the prop it's stored under in the item's root props - derived from the label, but editable) and a type:

| Type | Editor control |
| --- | --- |
| Text | Single-line text input |
| Textarea | Multi-line text input |
| Rich text | The Puck rich text editor; stores HTML |
| Number | Number input |
| Select | Dropdown of the options you define |
| Radio | Radio group of the options you define |
| Image | The media picker (the same control `imageField` gives a component) |

All but Image are [Puck's own field types](https://puckeditor.com/docs/api-reference/fields), used as-is. To offer more custom fields of your own, add them to `CONTENT_TYPE_FIELD_KINDS` in `src/puck/content-types.ts` and to `toPuckField()` in `src/puck/content-type-fields.tsx`.

A content type's fields are also what a `CardCollection` can sort its items by, and what a component's [bindable props](https://puckeditor.com/docs/) can bind to inside one of its cards.

## Structured data (JSON-LD)

The structured data section takes a schema.org `@type`, picked from the types PurplePanda knows about, and a mapping of that type's own properties to the fields that supply them - the property dropdown offers whichever properties belong to the type chosen, minus any another row already maps. For example, an Article type mapping `headline` to the item's title and `description` to its own `description` field publishes:

```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "Road Trip",
  "description": "Ultimate UP Road Trip"
}
```

Changing the type clears the mappings made against the previous one, since the properties on offer belong to the type. The catalog of types and their properties lives in `src/puck/jsonld-types.ts` - adding one is a single entry there, and the stored shape accepts any type and property name, so nothing else needs changing.

On a matching route, PurplePanda builds that object from the item's resolved root props, adds `"@context": "https://schema.org"`, and serializes it into a `<script type="application/ld+json">` tag in the page's `<head>`. A mapped property whose source field is empty on a given item is left out; a content type with no structured data configured emits none of its own. Structured data is only built for content-type routes (types with a `baseUrl`) - plain pages have no content type to look one up on.

### Breadcrumbs

Every page - content-type or plain - automatically gets a `BreadcrumbList` added alongside its own structured data (merged into the same `<script>` tag via `@graph` when both are present). The trail always starts with "Home" and ends with the current page, and each crumb's name is a page's own resolved `title` prop rather than its URL slug:

* On a content-type route (e.g. `/articles/my-post`), the trail is Home → *content type's `title`* (linking to its `baseUrl`) → the item's own `title` prop, since there's no real page behind the `baseUrl` prefix itself.
* On a plain page, the trail follows the page's `parentPage` ancestry, using each ancestor page's own `title` prop.

Breadcrumbs aren't added for the homepage.

## Reading content types in code

Server-side, `listContentTypes(db)`, `getContentTypeById(db, id)` and `matchContentTypeRoute(db, path)` in `src/db/content-types.ts` are the way in; they read through the same in-process cache (and the same cross-worker invalidation) as the site's settings and templates.

Client-side - inside a component's `resolveFields`, say - `getContentTypeRecords()` from `src/puck/content-types.ts` returns the same records, and `getContentTypes()`/`getContentType(id)` from `src/puck/content-type-fields.tsx` return them with their fields inflated into Puck `Fields`. Both admin layouts hand the browser the list ahead of any island, so these are plain synchronous reads.
