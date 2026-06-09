import type { Config, Data } from "@puckeditor/core";
import externalPuckConfig from "virtual:purplepanda/puck-config";
import { wrapConfigWithClientDataResolvers } from "../puck/client-data-wrapper.js";
import { filterConfigByLocation } from "../puck/index.js";
import PuckEditor from "./PuckEditor.js";

const baseConfig: Config = {
    categories: {
        /* we create this one here so other shows up and matches template */
        DummyHidden: {
            components: [],
            visible: false,
            defaultExpanded: true,
        },
    },
    components: {
    },
};

const hostConfig: Partial<Config> = externalPuckConfig ?? {};

const mergedConfig: Config = {
  ...baseConfig,
  ...hostConfig,
  components: {
    ...baseConfig.components,
    ...(hostConfig.components ?? {}),
  },
  categories: {
    ...(baseConfig.categories ?? {}),
    ...(hostConfig.categories ?? {}),
  },
};

const config = wrapConfigWithClientDataResolvers(filterConfigByLocation(mergedConfig, "page"));

const defaultInitialData: Data = { content: [], root: { props: {} } };

const defaultSave = (data: Data) => {
  console.log("Saving page data:", data);
};

interface PagePuckEditorProps {
  initialData?: Data;
  templateData?: Data;
  onPublish?: (data: Data) => void;
}

export default function PagePuckEditor({ initialData, templateData, onPublish }: PagePuckEditorProps = {}) {
  const optionalProps = templateData ? { templateData } : {};

  return (
    <PuckEditor
      config={config}
      data={initialData ?? defaultInitialData}
      onPublish={onPublish ?? defaultSave}
      {...optionalProps}
    />
  );
}
