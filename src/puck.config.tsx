import site from "purplepanda:site";
import { FormEmbed } from "./puck/form/index.js";
import { Checkbox, Image, RadioGroup, Select, Textarea, TextInput, Turnstile } from "./puck/form-fields/index.js";
import { definePuckConfig } from "./puck/index.js";
import { ImagePicker } from "./puck/media/index.js";
import { Accordion, Alerts, Button, Card, CardCollection, Flex, Grid, Margin, Rich, Section, Space, Video } from "./puck/prefab/index.js";

const config = definePuckConfig({
  categories: {
    Fields: {
      components: ["TextInput", "Textarea", "Select", "Checkbox", "RadioGroup", "Turnstile", "Image"],
    },
    Layout: {
      components: ["Section", "Card", "Flex", "Grid", "Space", "CardCollection", "Margin"],
    },
    Content: {
      components: ["Rich", "Alerts", "Button"],
    },
    // The private site module's categories, if it's built with one (see src/site/resolve.ts).
    ...site.categories,
  },
  components: {
    Section,
    Card,
    Grid,
    Flex,
    Space,
    Rich,
    TextInput,
    Textarea,
    Select,
    Checkbox,
    RadioGroup,
    Turnstile,
    Image,
    FormEmbed,
    CardCollection,
    Margin,
    Accordion,
    Video,
    Alerts,
    Button,
    ImagePicker,
    // Last, so the site module's own components (usually `optIn`, see puck/site-components.ts)
    // can also stand in for any above of the same name.
    ...site.components,
  },
  fontFamilies: ["https://use.typekit.net/pdw7dwo.css?family=josefin-sans", ...(site.fontFamilies ?? [])]
});

export default config;