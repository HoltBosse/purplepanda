import type { Data } from "@puckeditor/core";
import { useMemo } from "react";
import externalPuckConfig from "virtual:purplepanda/puck-config";
import PagePuckEditor from "./PagePuckEditor.js";

interface PrefabPuckEditorProps {
  contentTypeId?: string;
  initialData?: Data;
  templateData?: Data;
  saveUrl?: string;
  onPublish?: (data: Data) => void;
}

export default function PrefabPuckEditor({
  contentTypeId,
  initialData,
  templateData,
  saveUrl = "/admin/settings/prefab/update",
  onPublish,
}: PrefabPuckEditorProps) {
  const contentType = useMemo(
    () => (contentTypeId ? (externalPuckConfig?.contentTypes ?? []).find(ct => ct.id === contentTypeId) : undefined),
    [contentTypeId],
  );

  const rootConfig = useMemo(
    () => ({
      label: contentType?.title ?? "Prefab",
      fields: contentType?.fields ?? {},
    }),
    [contentType],
  );

  const optionalProps = {
    ...(initialData !== undefined ? { initialData } : {}),
    ...(templateData !== undefined ? { templateData } : {}),
    ...(onPublish !== undefined ? { onPublish } : {}),
  };

  return (
    <PagePuckEditor
      saveUrl={saveUrl}
      rootConfig={rootConfig}
      {...optionalProps}
    />
  );
}
