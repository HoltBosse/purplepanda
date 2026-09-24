import type { Data } from "@puckeditor/core";
import * as z from "zod";
import PagePuckEditor from "./PagePuckEditor.js";

interface NotFoundPuckEditorProps {
  initialData?: Data;
  saveUrl?: string;
}

const rootConfig = {
  label: "404 Page",
  fields: {
    title: { type: "text" as const, label: "Title" },
  },
  defaultProps: { title: "Page Not Found" },
};

const dictionary = { "label-page": "404 Page" };

// The 404 page has no alias (it's served for any unmatched path), so the default page schema's
// required alias doesn't apply. Title is optional too — 404.astro falls back to "Page Not Found".
const rootPropsSchema = () => z.object({ title: z.string().optional() }).loose();

export default function NotFoundPuckEditor({
  initialData,
  saveUrl = "/admin/settings/not-found/update",
}: NotFoundPuckEditorProps) {
  const optionalProps = {
    ...(initialData !== undefined ? { initialData } : {}),
  };

  return (
    <PagePuckEditor
      saveUrl={saveUrl}
      rootConfig={rootConfig}
      dictionary={dictionary}
      rootPropsSchema={rootPropsSchema}
      {...optionalProps}
    />
  );
}
