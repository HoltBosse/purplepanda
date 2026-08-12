import externalPuckConfig from "virtual:purplepanda/puck-config";
import type { Config, Data } from "@puckeditor/core";
import { useMemo } from "react";
import { wrapConfigWithClientDataResolvers } from "../puck/client-data-wrapper.js";
import { notifyUsersField } from "../puck/component-fields/NotifyUsersField.js";
import { filterConfigByLocation, wrapConfigWithDataBinding } from "../puck/index.js";
import PuckEditor from "./PuckEditor.js";

type PageOption = { id: string; title: string };

// Cached across the editor session: the redirect field's resolveFields (below) reruns on every
// root prop edit, not just once, so without this a keystroke in "Form Name" would refetch the
// whole page list.
let pageOptionsPromise: Promise<PageOption[]> | null = null;

function getPageOptions(): Promise<PageOption[]> {
  if (!pageOptionsPromise) {
    pageOptionsPromise = fetch("/admin/pages/api/lookup", { credentials: "same-origin" })
      .then((res) => (res.ok ? (res.json() as Promise<PageOption[]>) : []))
      .catch(() => []);
  }
  return pageOptionsPromise;
}

const NO_REDIRECT_OPTION = { label: "Show a success message (no redirect)", value: "" };

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
        notifyUserIds: notifyUsersField,
        redirectPage: {
          type: "select" as const,
          label: "Redirect to page on submit",
          options: [NO_REDIRECT_OPTION],
        },
      },
      defaultProps: {
        name: "",
        notifyUserIds: [],
        redirectPage: "",
      },
      resolveFields: async (_data: unknown, { fields }: { fields: Record<string, unknown> }) => {
        const pages = await getPageOptions();
        return {
          ...fields,
          redirectPage: {
            type: "select" as const,
            label: "Redirect to page on submit",
            options: [NO_REDIRECT_OPTION, ...pages.map((page) => ({ label: page.title, value: page.id }))],
          },
        };
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
