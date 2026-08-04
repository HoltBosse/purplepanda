---
title: Fonts
description: Configuring preset fonts for the admin font pickers.
---

In your Puck config, `fontFamilies` is an optional top level key: an array of stylesheet URLs.

```js
export default definePuckConfig({
  fontFamilies: [
    "https://fonts.bunny.net/css2?family=your-font:wght@400;700&display=swap",
    "https://use.typekit.net/your-css-slug.css?family=your-font",
  ],s
  // ...
});
```

Each URL must be a CSS file and must include a `family` query param — this is how PurplePanda reads back the font's display name (everything before a `:` in the param's value) without needing to fetch or parse the stylesheet itself.

These show up as "Site Fonts" — quick-select entries pinned above the searchable [Bunny Fonts](https://fonts.bunny.net/) list in the Heading Font and Body Font pickers under **Settings**. This is useful for offering a curated set of on-brand fonts, or for fonts hosted outside Bunny/Google (e.g. an Adobe Fonts/Typekit kit), which aren't otherwise searchable.

Picking a preset stores its full URL as-is (the same as any other font selection) — it's loaded via a `<link rel="stylesheet">` on the front end, and the extracted family name is applied to `body` and heading elements.
