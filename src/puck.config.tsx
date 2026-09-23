import { imageField } from "./puck/component-fields/index.js";
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
  // https://www.uuidgenerator.net/version4
  contentTypes: [
    {
      id: "61518547-b321-4b88-aea7-a235acdc4619",
      title: "Article",
      fields: {
        description: { type: "text" },
        body: { type: "richtext" },
      },
      baseUrl: "/articles",
      jsonLd: (props) => ({
        "@type": "Article",
        headline: props.title,
        description: props.description,
      }),
    },
    {
      id: "387dc1e1-e2bb-4dce-9f37-ab8ae199c67b",
      title: "Product",
      fields: {
        price: { type: "number" },
        description: { type: "text" },
        image: imageField,
      },
      baseUrl: "/products",
    }
  ],
  fontFamilies: ["https://use.typekit.net/pdw7dwo.css?family=josefin-sans"]
});

export default config;