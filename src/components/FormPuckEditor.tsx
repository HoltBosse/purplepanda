import type { Config, Data } from "@puckeditor/core";
import externalPuckConfig from "virtual:purplepanda/puck-config";
import { wrapConfigWithClientDataResolvers } from "../puck/client-data-wrapper.js";
import PuckEditor from "./PuckEditor.js";

const baseConfig: Config = {
    categories: {
        DummyHidden: {
            components: [],
            visible: false,
            defaultExpanded: true,
        },
    },
    components: {},
};

const hostConfig: Partial<Config> = externalPuckConfig ?? {};

const mergedConfig: Config = {
  ...baseConfig,
  ...hostConfig,
  components: {
    ...baseConfig.components,
    ...(hostConfig.components ?? {}),
  },
};

const config = wrapConfigWithClientDataResolvers(mergedConfig);

const defaultInitialData: Data = { content: [], root: { props: {} } };

const defaultSave = (data: Data) => {
  console.log("Saving form data:", data);
};

interface FormPuckEditorProps {
  initialData?: Data;
  onPublish?: (data: Data) => void;
}

export default function FormPuckEditor({ initialData, onPublish }: FormPuckEditorProps = {}) {
  return (
    <PuckEditor
      config={config}
      data={initialData ?? defaultInitialData}
      onPublish={onPublish ?? defaultSave}
    />
  );
}
