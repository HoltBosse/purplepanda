import externalPuckConfig from "virtual:purplepanda/puck-config";
import type { Config, Data, Dictionary, Fields } from "@puckeditor/core";
import { useMemo } from "react";
import { wrapConfigWithClientDataResolvers } from "../puck/client-data-wrapper.js";
import { aliasField } from "../puck/component-fields/AliasField.js";
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
  draftPublishUrl?: string;
  onPublish?: (data: Data) => void;
  onSave?: (data: Data) => void;
  isDraft?: boolean;
  pages?: PageOption[];
  rootConfig?: { label?: string; fields?: Fields; defaultProps?: Record<string, unknown> };
  headingFontLink?: string;
  bodyFontLink?: string;
  dictionary?: Dictionary;
}

export default function PagePuckEditor({ initialData, templateData, saveUrl = "/admin/pages/update", draftPublishUrl, onPublish, onSave, isDraft = false, pages = [], rootConfig, headingFontLink, bodyFontLink, dictionary }: PagePuckEditorProps = {}) {
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

  const defaultDraftPublish = (data: Data) => {
    if (!draftPublishUrl) {
      return;
    }

    if (!confirm("Are you sure you want to make this draft live?")) {
      return;
    }

    const form = document.createElement("form");
    form.method = "POST";
    form.action = draftPublishUrl;
    form.style.display = "none";

    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "content";
    input.value = JSON.stringify(data);
    form.appendChild(input);

    document.body.appendChild(form);
    form.submit();
  };

  // Editing a draft chains a new draft dag node rather than publishing, so the
  // default save action belongs on the Save button, not Puck's Publish button.
  const resolvedOnPublish = isDraft ? (onPublish ?? defaultDraftPublish) : (onPublish ?? defaultSave);
  const resolvedOnSave = isDraft ? (onSave ?? defaultSave) : onSave;
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
          alias: aliasField,
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

  const optionalProps = {
    ...(templateData ? { templateData } : {}),
    ...(resolvedOnSave ? { onSave: resolvedOnSave } : {}),
    ...(headingFontLink ? { headingFontLink } : {}),
    ...(bodyFontLink ? { bodyFontLink } : {}),
    ...(dictionary ? { dictionary } : {}),
  };

  return (
    <PuckEditor
      config={configWithRootFields}
      data={initialData ?? defaultInitialData}
      onPublish={resolvedOnPublish}
      {...optionalProps}
    />
  );
}
