---
title: Fonts
description: Configuring preset fonts for the theme's font pickers.
---

In your Puck config, `fontFamilies` is an optional top level key: an array of stylesheet URLs.

```js
export default definePuckConfig({
  fontFamilies: [
    "https://fonts.bunny.net/css2?family=your-font:wght@400;700&display=swap",
    "https://use.typekit.net/your-css-slug.css?family=your-font",
  ],
  // ...
});
```

Each URL must be a CSS file and must include a `family` query param — this is how PurplePanda reads back the font's display name (everything before a `:` in the param's value) without needing to fetch or parse the stylesheet itself.

These show up as "Site Fonts" — quick-select entries pinned above the searchable [Bunny Fonts](https://fonts.bunny.net/) list in the heading and body font pickers on the [theme](/devs/themes) screen (**Settings → Themes**). This is useful for offering a curated set of on-brand fonts, or for fonts hosted outside Bunny/Google (e.g. an Adobe Fonts/Typekit kit), which aren't otherwise searchable.

Picking a preset stores its full URL as-is, and it's loaded via a `<link rel="stylesheet">` on the front end. A Bunny font's link is instead rebuilt when the theme is saved, so it loads exactly the weights the theme's text styles and buttons use. A preset's weights aren't PurplePanda's to choose, so its URL should already ask for every weight you need. The family is applied to `body` and heading elements, and to the theme's text styles.

Fonts used to be set under **Settings** as `heading_font_link` and `body_font_link`. A site that set them and hasn't published a theme yet keeps rendering them, and the theme screen starts from them.
