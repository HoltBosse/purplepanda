import { FormEmbed } from "./puck/form/index.js";
import { Checkbox, Image, RadioGroup, Select, Textarea, TextInput, Turnstile } from "./puck/form-fields/index.js";
import { definePuckConfig } from "./puck/index.js";
import { ImagePicker } from "./puck/media/index.js";
import { Accordion, Alerts, CardCollection, Flex, Grid, Margin, Rich, Space, Video } from "./puck/prefab/index.js";

const config = definePuckConfig({
  categories: {
    Fields: {
      components: ["TextInput", "Textarea", "Select", "Checkbox", "RadioGroup", "Turnstile", "Image"],
    },
    Layout: {
      components: ["Flex", "Grid", "Space", "CardCollection", "Margin"],
    },
    Content: {
      components: ["Rich", "Alerts"],
    }
  },
  components: {
    HeadingBlock: {
      fields: {
        children: {
          type: "text",
        },
      },
      render: ({ children }) => {
        return <h1>{children}</h1>;
      },
    },
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
    SubmitButton: {
      fields: {
        children: {
          type: "text",
        },
      },
      defaultProps: { children: "Submit" },
      render: ({ children }) => {
        return <button className="btn btn-primary" type="submit">{children}</button>;
      },
    },
    ImagePicker
  },
  fontFamilies: ["https://use.typekit.net/pdw7dwo.css?family=josefin-sans"]
});

export default config;