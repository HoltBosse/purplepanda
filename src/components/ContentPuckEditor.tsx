import externalPuckConfig from "virtual:purplepanda/puck-config";
import type { Data } from "@puckeditor/core";
import { useMemo } from "react";
import { aliasField } from "../puck/component-fields/AliasField.js";
import { dateTimeField } from "../puck/component-fields/DateTimeField.js";
import { notesField } from "../puck/component-fields/NotesField.js";
import PagePuckEditor from "./PagePuckEditor.js";

interface ContentPuckEditorProps {
  contentTypeId: string;
  initialData?: Data;
  templateData?: Data;
  saveUrl?: string;
  draftPublishUrl?: string;
  onPublish?: (data: Data) => void;
  onCommit?: (data: Data) => void;
  isDraft?: boolean;
  isNew?: boolean;
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
  onCommit,
  isDraft,
  isNew,
  headingFontLink,
  bodyFontLink,
}: ContentPuckEditorProps) {
  const contentType = useMemo(
    () => (externalPuckConfig?.contentTypes ?? []).find(ct => ct.id === contentTypeId),
    [contentTypeId],
  );

  const rootConfig = useMemo(() => {
    if (!contentType) {
      return undefined;
    }
    // Title and alias are always present for content items and always use these hardcoded
    // definitions — a content type's own "title"/"alias" fields (if any) are dropped so they
    // can't override them. Every other field the content type defines is added on after, followed
    // by the start/end scheduling window and a free-text notes field.
    const { title: _title, alias: _alias, start: _start, end: _end, notes: _notes, ...otherFields } = contentType.fields;
    return {
      label: contentType.title,
      fields: {
        title: { type: "text" as const, label: "Title" },
        alias: aliasField,
        ...otherFields,
        start: { ...dateTimeField, label: "Start" },
        end: { ...dateTimeField, label: "End" },
        notes: notesField,
      },
    };
  }, [contentType]);

  const dictionary = useMemo(
    () => contentType ? { "label-page": contentType.title } : undefined,
    [contentType],
  );

  const optionalProps = {
    ...(initialData !== undefined ? { initialData } : {}),
    ...(templateData !== undefined ? { templateData } : {}),
    ...(onPublish !== undefined ? { onPublish } : {}),
    ...(onCommit !== undefined ? { onCommit } : {}),
    ...(rootConfig !== undefined ? { rootConfig } : {}),
    ...(dictionary !== undefined ? { dictionary } : {}),
    ...(isDraft !== undefined ? { isDraft } : {}),
    ...(isNew !== undefined ? { isNew } : {}),
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
