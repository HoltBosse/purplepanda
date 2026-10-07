---
title: Themes
description: The site theme, and how components take their colors, fonts and borders from it.
---

Every site has one theme, edited by super admins under **Settings → Themes** (`/admin/settings/themes`). It defines the site's colors, color schemes, gradients, fonts, text styles, corner radii, button variants, border presets and the card look. Components don't carry color, font or border settings of their own: they name a theme item by id, and the theme's generated CSS styles them. Editing the theme restyles every page.

## What the theme holds

- **Colors**, each with a light and a dark value. Dark values apply when the visitor's device is in dark mode.
- **Schemes**: a matched set of colors for one surface (background, text, muted text, button background, button text, border). A scheme can use a **gradient** as its background, and keeps a solid background for surfaces nested inside it.
- **Fonts**: named fonts from [Bunny Fonts](https://fonts.bunny.net/) (or one of the install's [preset fonts](/devs/fonts)). Heading and Body are built in: Heading styles every h1–h6, Body the page itself and buttons. Others, such as an accent script or a mono, are reached only through text styles and load on pages only while a text style uses them. Only the weights the theme uses are loaded, and the theme screen warns past four fonts.
- **Text styles**: Display, Heading 1–3, Body and Small are built in, and super admins can add their own (a "Pull quote", an "Eyebrow"). Each one sets the font, size, weight and line height.
- **Radii**, **button variants**, **border presets** and the **card** look.

Sizes are in component units, the same as Space and Flex: 1 unit is `0.25rem` (see `units()` in `src/theme/units.ts`). Border widths are the exception and are set in pixels, so 1px hairlines stay possible.

The default scheme, the Primary, Secondary and Ghost variants, the Subtle and Strong borders, the Heading and Body fonts, and the six built-in text styles can't be deleted, because components and new sections rely on them.

## Using the theme in a component

Content stores only ids, such as `{ scheme: "brand" }`, `{ variant: "accent" }`, `{ textStyle: "h2" }` or `{ border: "subtle" }`. Ask for the fields a component needs with `themeStyleFields`. These are custom fields that show real swatches and styled samples from the site's theme:

```tsx
import { themeStyleFields, textStyleClass, variantClass } from "../component-fields/ThemeFields.js";

const Callout: ComponentConfig<CalloutProps> = {
  fields: {
    ...themeStyleFields({ scheme: {} }),
    content: { type: "slot" },
  },
  defaultProps: { scheme: "default", content: [] },
  render: ({ scheme, content: Content }) => (
    <aside data-scheme={scheme || "default"}>
      <Content />
    </aside>
  ),
};
```

The generated CSS uses these names. They are all prefixed, because the admin and the editor canvas also load daisyUI, which owns `--border` and `data-theme`:

| Use | Markup |
| --- | --- |
| A surface in a scheme | `data-scheme="<id>"` on the element. Only that element paints a gradient. |
| Colors inside a scheme | `var(--pp-scheme-bg)`, `--pp-scheme-fg`, `--pp-scheme-muted`, `--pp-scheme-btn-bg`, `--pp-scheme-btn-fg`, `--pp-scheme-border`, or the `pp-muted` class |
| A button | `class="pp-btn pp-btn--<variant>"` (`variantClass(variant)`) |
| A text style | `class="pp-text-<id>"` (`textStyleClass(textStyle)`). Rich text inside `.pp-rich` gets the built-in heading and body styles automatically, and any paragraph or heading in it can take a text style from the editor's **Text style** menu, stored as `data-text-style="<id>"`. |
| A card surface | `class="pp-card"`, plus `data-scheme` to give it a scheme of its own. Without a border of its own it takes the theme's card border, on the theme's card sides. |
| A border | `data-pp-border="<id>"` (or `"none"`) and `data-pp-sides="top bottom"`, any of `top right bottom left`. Use `borderAttrs(border, borderSides)`. |
| Fonts and radii | `var(--pp-font-<id>)` for any theme font (`--pp-heading-font` and `--pp-body-font` also name the built-in two), `var(--pp-radius-sm \| md \| lg \| full)` |

Borders work like the other fields, but which sides they go on is a second prop. Card, Card Collection and Section use `themeStyleFields({ border: {} })` (with `allowInherit: true` on cards, for "Theme default") alongside `borderSidesField()`, and hide the sides field until a preset is picked with `withoutIdleSides` in `resolveFields`. The width and color always come from the preset: editors never set them.

Puck fills in `defaultProps` for content in the editor but not on the published page. A new prop on an existing component should therefore default to the look the component had before, or old content will look different in the editor than on the site. For example, Card Collection's `cardStyle` defaults to `plain`.

## Deleting theme items

Deleting a scheme, variant, text style or border preset that content uses asks for a replacement and records it in the theme's `replaced` map, as a tombstone. Pages, templates, page drafts and old revisions keep the old id. The generated CSS styles the old id as its replacement, so nothing has to be rewritten. An id the theme has never known renders as the default scheme, the Primary variant or the Subtle border, and an unknown text style adds no styling. Deleting a color or font is different: they're only referenced inside the theme, so those references are rewritten in place. The theme fields warn editors about either case.

## Storage

The theme is the `theme` row in `settings`, read through the settings cache, so a save reaches every worker. There are no theme drafts: saving on the theme screen makes the change live at once. Each save also adds a history row to `dag_nodes` with `entityType: 'theme'`, the same as prefab saves. Stored themes are always read through `normalizeTheme` (`src/theme/normalize.ts`), so the shape can change without a migration. A site that has never saved a theme renders the default preset (`src/theme/presets.ts`), with the fonts from the older `heading_font_link` and `body_font_link` settings if it had set them.

Saving logs a `theme:update` [action](/devs/hooks-reference).
