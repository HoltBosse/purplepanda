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

