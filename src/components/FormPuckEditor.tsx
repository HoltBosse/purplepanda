import type { Config, Data } from "@puckeditor/core";
import { useMemo } from "react";
import externalPuckConfig from "virtual:purplepanda/puck-config";
import { wrapConfigWithClientDataResolvers } from "../puck/client-data-wrapper.js";
import { filterConfigByLocation, wrapConfigWithDataBinding } from "../puck/index.js";
import PuckEditor from "./PuckEditor.js";

const baseConfig: Config = {
    root: {
      label: "Form",
    },
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
  categories: {
    ...(baseConfig.categories ?? {}),
    ...(hostConfig.categories ?? {}),
  },
};

const config = wrapConfigWithClientDataResolvers(wrapConfigWithDataBinding(filterConfigByLocation(mergedConfig, "form")));

const defaultInitialData: Data = { content: [], root: { props: {} } };

interface FormPuckEditorProps {
  initialData?: Data;
  saveUrl?: string;
  onPublish?: (data: Data) => void;
  onSave?: (data: Data) => void;
}

export default function FormPuckEditor({ initialData, saveUrl = "/admin/forms/update", onPublish, onSave }: FormPuckEditorProps = {}) {
  const defaultSave = (data: Data) => {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = saveUrl;
    form.style.display = "none";

    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "content";
    input.value = JSON.stringify(data);
    form.appendChild(input);

    document.body.appendChild(form);
    form.submit();
  };

  const configWithRootFields = useMemo(() => ({
    ...config,
    root: {
      ...config.root,
      fields: {
        name: { type: "text" as const, label: "Form Name" },
      },
      defaultProps: {
        name: "",
      },
    },
  }), []);

  const optionalProps = onSave ? { onSave } : {};

  return (
    <PuckEditor
      config={configWithRootFields}
      data={initialData ?? defaultInitialData}
      onPublish={onPublish ?? defaultSave}
      dictionary={{ "label-page": "Form" }}
      {...optionalProps}
    />
  );
}
