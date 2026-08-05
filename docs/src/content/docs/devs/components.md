---
title: Components
description: How to set up a your first component.
---

# Provided Components

```js
import { TextInput, Textarea, Select, Checkbox, RadioGroup, Turnstile, Image } from "@holtbosse/purplepanda/puck/form-fields";
import { FormEmbed } from "@holtbosse/purplepanda/puck/form";
import { Grid, Flex, Space, Rich, CardCollection, Margin, Accordion } from "@holtbosse/purplepanda/puck/prefab";
import { ImagePicker } from "@holtbosse/purplepanda/puck/media";
```

# Additional Puck component fields

* `data`: A function that returns params matching your render function. is wrapped for client side integration in puck editor and server side in rendering. Allows you to get server side data.
* `locations`: String or array of strings for `form`, `page`, and/or `template`. Controls where the component shows up
* `bindableFields`: A record mapping a component's own prop names to binding metadata (`label`, optional `fieldTypes`, optional `overridable`). Marks that prop as eligible for data-binding when the component is nested inside a `CardCollection`'s card template, so each rendered card can pull the prop's value from a different field on its content-type item. `overridable` additionally lets a group of sub-keys on the bound value (e.g. an image's width/height) be pinned to one shared value set by the author, instead of varying per item.
* `island`: Set to `true` to hydrate the component as a standalone React island on the published front end. By default a rendered page is fully static HTML — no React runs in the browser. An island component's whole `render` output is hydrated into a live React root, so `useState`, `useEffect`, and event handlers work, while the rest of the page stays static. Its props must be JSON-serializable (primitives, plain objects/arrays) — no `slot` fields or `ReactNode` props, since the props travel to the browser inside the island marker.
* `toSubmissionSchema`: A function, given the component's stored props, that returns the Zod schema its posted value must satisfy when used as a form field. Combined across a form's components (keyed by `field-${id}`) into one submission schema. Only components used as form fields need this — others are left unvalidated.
* `processSubmission`: A function for a form field whose posted value needs a server-side side effect before it's stored — writing an uploaded file to disk, inserting a DB row, calling an external API — rather than being stored as posted. Given the raw `FormData` value(s) for the field (before it's reduced to plain JSON) and the component's own stored props, it returns the value to store in the submission's `data` in its place; that value is what `toSubmissionSchema` then validates. It only runs once a submission has already passed spam/CSRF checks, so a rejected bot submission never triggers the side effect. Throw to reject the submission with a field-specific error message. See `form-fields/Image.tsx` — it writes the uploaded file to disk, creates a media record in the configured destination folder, and stores a `{ id, title, alt }` reference.
* `submissionDisplay`: Set to `false` to hide this field from the admin submissions viewer, for fields whose stored value isn't a meaningful answer to show an admin — e.g. Turnstile's verification token. Defaults to shown.
* `renderSubmissionValue`: A function for custom rendering of a field's stored value in the admin submissions viewer, for values the viewer's default text formatting wouldn't render usefully. Given the stored value and the component's props, it returns an HTML string the viewer injects as-is (so it must already be safe/escaped). Omit to fall back to the viewer's default formatting. `Image.tsx` uses this to show its stored media reference as a thumbnail instead of a printed object.

## Interactive islands

```js
import type { ComponentConfig } from "@puckeditor/core";
import { useState } from "react";

const Counter: ComponentConfig<{ start: number }> = {
  island: true, // hydrate this component on the front end
  fields: { start: { type: "number" } },
  defaultProps: { start: 0 },
  render: ({ start }) => {
    const [count, setCount] = useState(start);
    return <button onClick={() => setCount((c) => c + 1)}>Count: {count}</button>;
  },
};
```

Server-rendered markup and interactive islands can be freely mixed in a single `render` — everything outside the interactive parts is emitted as static HTML, and the whole component hydrates as one root:

```js
render: ({ start }) => (
  <div>
    <p>Static server content</p>
    <Counter start={start} />
    <p>More static server content</p>
  </div>
)
```

## Further reading

- Read [Puck's documentation](https://puckeditor.com/docs/api-reference/components) for more information
