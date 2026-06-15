import type { Data } from "@puckeditor/core";
import { useMemo } from "react";
import externalPuckConfig from "virtual:purplepanda/puck-config";
import PagePuckEditor from "./PagePuckEditor.js";

interface ContentPuckEditorProps {
  contentTypeId: string;
  initialData?: Data;
  templateData?: Data;
  saveUrl?: string;
  onPublish?: (data: Data) => void;
}

export default function ContentPuckEditor({
  contentTypeId,
  initialData,
  templateData,
  saveUrl = "/admin/content/update",
  onPublish,
}: ContentPuckEditorProps) {
  const contentType = useMemo(
    () => (externalPuckConfig?.contentTypes ?? []).find(ct => ct.id === contentTypeId),
    [contentTypeId],
  );

  const rootConfig = useMemo(
    () => contentType ? { label: contentType.title, fields: contentType.fields } : undefined,
    [contentType],
  );

  const optionalProps = {
    ...(initialData !== undefined ? { initialData } : {}),
    ...(templateData !== undefined ? { templateData } : {}),
    ...(onPublish !== undefined ? { onPublish } : {}),
    ...(rootConfig !== undefined ? { rootConfig } : {}),
  };

  return (
    <PagePuckEditor
      saveUrl={saveUrl}
      {...optionalProps}
    />
  );
}
