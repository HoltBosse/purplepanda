import type { Config, Data } from "@puckeditor/core";
import externalPuckConfig from "virtual:purplepanda/puck-config";
import { wrapConfigWithClientDataResolvers } from "../puck/client-data-wrapper.js";
import PuckEditor from "./PuckEditor.js";

const baseConfig: Config = {
    categories: {
        TemplateSlot: {
            components: ["TemplateSlot"],
            visible: false,
            defaultExpanded: true,
        },
    },
    components: {
        TemplateSlot: {
            permissions: {
                delete: false,
                duplicate: false,
                insert: false,
            },
            render: () => {
                return (
                    <div className="flex items-center justify-center w-full h-64 bg-gradient-to-br from-purple-50 to-blue-50 border-2 border-dashed border-purple-300 rounded-lg">
                        <div className="text-center">
                            <div className="text-purple-400 mb-2">
                                <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-semibold text-purple-900 mb-1">Content</h3>
                            <p className="text-sm text-purple-600">Your content will appear here</p>
                        </div>
                    </div>
                );
            },
        },
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
};

const config = wrapConfigWithClientDataResolvers(mergedConfig);

const defaultInitialData: Data = {
  content: [{ type: "TemplateSlot", props: { id: "TemplateSlot-default" } }],
  root: { props: {} },
};

interface TemplatePuckEditorProps {
  initialData?: Data;
  saveUrl?: string;
  templateData?: Data;
  onPublish?: (data: Data) => void;
}

export default function TemplatePuckEditor({
  initialData,
  saveUrl = "/admin/templates/update",
  templateData,
  onPublish,
}: TemplatePuckEditorProps = {}) {
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

  const optionalProps = templateData ? { templateData } : {};

  return (
    <PuckEditor
      config={config}
      data={initialData ?? defaultInitialData}
      {...optionalProps}
      onPublish={onPublish ?? defaultSave}
    />
  );
}
