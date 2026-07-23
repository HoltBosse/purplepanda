import { getDb } from "../../db/db.js";
import { forms } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Render } from "@puckeditor/core";
import type { Config, Data } from "@puckeditor/core";
import externalPuckConfig from "virtual:purplepanda/puck-config";
import { filterConfigByLocation, wrapConfigWithIslands } from "../index.js";

const hostConfig = (externalPuckConfig as Config) ?? ({} as Config);
// Island wrapping so any form field flagged `island: true` (e.g. Select) emits its hydration
// marker into the static form HTML. The marker is injected into a PageRenderer page by FormEmbed,
// where the front-end runtime finds and hydrates it.
const filteredFormConfig = wrapConfigWithIslands(filterConfigByLocation(hostConfig, "form"));

export async function getFormHtml(id: string): Promise<string | null> {
  const db = getDb();
  const result = await db.select({ content: forms.content }).from(forms).where(eq(forms.id, id)).limit(1);
  if (!result[0]) return null;

  const formRenderConfig: Config = {
    ...filteredFormConfig,
    root: {
      render: (props: any) =>
        createElement(
          "form",
          { className: "form-embed", method: "post", action: `/purplepanda/forms/${id}/submit` },
          props.children,
        ),
    },
  };

  const html = renderToStaticMarkup(
    createElement(Render, { config: formRenderConfig, data: result[0].content as Data }),
  );

  const hasFileInput = /type=(["'])file\1/i.test(html);
  return hasFileInput ? html.replace("<form ", '<form enctype="multipart/form-data" ') : html;
}
