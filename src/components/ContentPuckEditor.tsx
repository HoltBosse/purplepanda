import type { Data } from "@puckeditor/core";
import { useMemo } from "react";
import externalPuckConfig from "virtual:purplepanda/puck-config";
import PagePuckEditor from "./PagePuckEditor.js";

interface ContentPuckEditorProps {
  contentTypeId: string;
  initialData?: Data;
  templateData?: Data;
  saveUrl?: string;
  draftPublishUrl?: string;
  onPublish?: (data: Data) => void;
  isDraft?: boolean;
  headingFontLink?: string;
  bodyFontLink?: string;
}

export default function ContentPuckEditor({
  contentTypeId,
  initialData,
  templateData,
  saveUrl = "/admin/content/update",
  draftPublishUrl,
  onPublish,
  isDraft,
  headingFontLink,
  bodyFontLink,
}: ContentPuckEditorProps) {
  const contentType = useMemo(
    () => (externalPuckConfig?.contentTypes ?? []).find(ct => ct.id === contentTypeId),
    [contentTypeId],
  );

  const rootConfig = useMemo(
    () => contentType ? { label: contentType.title, fields: contentType.fields } : undefined,
    [contentType],
  );

  const dictionary = useMemo(
    () => contentType ? { "label-page": contentType.title } : undefined,
    [contentType],
  );

  const optionalProps = {
    ...(initialData !== undefined ? { initialData } : {}),
    ...(templateData !== undefined ? { templateData } : {}),
    ...(onPublish !== undefined ? { onPublish } : {}),
    ...(rootConfig !== undefined ? { rootConfig } : {}),
    ...(dictionary !== undefined ? { dictionary } : {}),
    ...(isDraft !== undefined ? { isDraft } : {}),
    ...(draftPublishUrl !== undefined ? { draftPublishUrl } : {}),
    ...(headingFontLink !== undefined ? { headingFontLink } : {}),
    ...(bodyFontLink !== undefined ? { bodyFontLink } : {}),
  };

  return (
    <PagePuckEditor
      saveUrl={saveUrl}
      {...optionalProps}
    />
  );
}
