import externalPuckConfig from "virtual:purplepanda/puck-config";
import type { Config, Data } from "@puckeditor/core";
import { useMemo } from "react";
import { wrapConfigWithClientDataResolvers } from "../puck/client-data-wrapper.js";
import { notifyUsersField } from "../puck/component-fields/NotifyUsersField.js";
import { collectComponentNodes } from "../puck/content-tree.js";
import { formRootPropsSchema } from "../puck/form-root-schema.js";
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
const NO_REPLY_TO_OPTION = { label: "None", value: "" };

// Reply-to can only point at an email address the submitter themselves typed in, so the option
// list is built from the form's own canvas rather than fetched — every TextInput placed on the
// form whose "Input type" is set to Email. Value is `field-${id}` to match the key the submitted
// value is stored under (see puck/form/schema.js), which is what submit.ts reads back out at
// send time.
function getEmailFieldOptions(content: Data["content"]): Array<{ label: string; value: string }> {
  return collectComponentNodes(content)
    .filter((node) => node.type === "TextInput" && node.props.inputType === "email" && typeof node.props.id === "string")
    .map((node) => ({
      label: (typeof node.props.label === "string" && node.props.label.trim()) || "Email field",
      value: `field-${node.props.id}`,
    }));
}

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
        replyTo: {
          type: "select" as const,
          label: "Reply-to",
          options: [NO_REPLY_TO_OPTION],
        },
        redirectPage: {
          type: "select" as const,
          label: "Redirect to page on submit",
          options: [NO_REDIRECT_OPTION],
        },
      },
      defaultProps: {
        name: "",
        notifyUserIds: [],
        replyTo: "",
        redirectPage: "",
      },
      resolveFields: async (
        _data: unknown,
        { fields, appState }: { fields: Record<string, unknown>; appState: { data: Data } },
      ) => {
        const pages = await getPageOptions();
        return {
          ...fields,
          replyTo: {
            type: "select" as const,
            label: "Reply-to",
            options: [NO_REPLY_TO_OPTION, ...getEmailFieldOptions(appState.data.content)],
          },
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
      rootPropsSchema={formRootPropsSchema}
      {...optionalProps}
    />
  );
}
