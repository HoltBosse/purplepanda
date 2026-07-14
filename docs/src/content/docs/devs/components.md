---
title: Components
description: How to set up a your first component.
---

# Provided Components

```js
import { TextInput, Textarea, Select, Checkbox, RadioGroup } from "@holtbosse/purplepanda/puck/form-fields";
import { FormEmbed } from "@holtbosse/purplepanda/puck/form";
import { Grid, Flex, Space, Rich, CardCollection, Margin } from "@holtbosse/purplepanda/puck/prefab";
import { ImagePicker } from "@holtbosse/purplepanda/puck/media";
```

# Additional Puck component fields

* `data`: A function that returns params matching your render function. is wrapped for client side integration in puck editor and server side in rendering. Allows you to get server side data.
* `locations`: String or array of strings for `form`, `page`, and/or `template`. Controls where the component shows up

## Further reading

- Read [Puck's documentation](https://puckeditor.com/docs/api-reference/components) for more information
