import { Puck } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import "../styles/puck-theme.css";
import type { Config, Data } from "@puckeditor/core";

const config: Config = {
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
  },
};

const initialData: Data = { content: [], root: { props: {} } };

const save = (data: Data) => {
  console.log("Saving data:", data);
};

export default function PuckEditor() {
  return <Puck config={config} data={initialData} onPublish={save} />;
}
