import type { Config, Data, Fields } from "@puckeditor/core";
import { useMemo } from "react";
import externalPuckConfig from "virtual:purplepanda/puck-config";
import { wrapConfigWithClientDataResolvers } from "../puck/client-data-wrapper.js";
import { filterConfigByLocation, wrapConfigWithDataBinding } from "../puck/index.js";
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

const config = wrapConfigWithClientDataResolvers(wrapConfigWithDataBinding(filterConfigByLocation(mergedConfig, "page")));

const defaultInitialData: Data = { content: [], root: { props: {} } };

export interface PageOption {
  id: string;
  title: string;
}

interface PagePuckEditorProps {
  initialData?: Data;
  templateData?: Data;
  saveUrl?: string;
  onPublish?: (data: Data) => void;
  pages?: PageOption[];
  rootConfig?: { label?: string; fields?: Fields; defaultProps?: Record<string, unknown> };
}

export default function PagePuckEditor({ initialData, templateData, saveUrl = "/admin/pages/update", onPublish, pages = [], rootConfig }: PagePuckEditorProps = {}) {
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
  const configWithRootFields = useMemo(() => {
    if (rootConfig) {
      return {
        ...config,
        root: {
          ...config.root,
          ...(rootConfig.label !== undefined ? { label: rootConfig.label } : {}),
          ...(rootConfig.fields !== undefined ? { fields: rootConfig.fields } : {}),
          ...(rootConfig.defaultProps !== undefined ? { defaultProps: rootConfig.defaultProps } : {}),
        },
      };
    }
    return {
      ...config,
      root: {
        ...config.root,
        fields: {
          title: { type: "text" as const, label: "Title" },
          alias: { type: "text" as const, label: "Alias" },
          parentPage: {
            type: "select" as const,
            label: "Parent Page",
            options: [
              { label: "None", value: "" },
              ...pages.map((p) => ({ label: p.title || p.id, value: p.id })),
            ],
          },
        },
        defaultProps: {
          title: "",
          alias: "",
          parentPage: "",
        },
      },
    };
  }, [pages, rootConfig]);

  const optionalProps = templateData ? { templateData } : {};

  return (
    <PuckEditor
      config={configWithRootFields}
      data={initialData ?? defaultInitialData}
      onPublish={onPublish ?? defaultSave}
      {...optionalProps}
    />
  );
}
