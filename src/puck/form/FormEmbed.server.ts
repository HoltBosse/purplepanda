import { getDb } from "../../db/db.js";
import { forms } from "../../db/schema.js";
import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Render } from "@puckeditor/core";
import type { Config, Data } from "@puckeditor/core";
import externalPuckConfig from "virtual:purplepanda/puck-config";
import { filterConfigByLocation } from "../index.js";

const hostConfig = (externalPuckConfig as Config) ?? ({} as Config);

const formRenderConfig: Config = {
  ...filterConfigByLocation(hostConfig, "form"),
  root: {
    render: (props: any) => createElement("form", { className: "form-embed" }, props.children),
  },
};

export async function getFormHtml(id: string): Promise<string | null> {
  const db = getDb();
  const result = await db.select({ content: forms.content }).from(forms).where(eq(forms.id, id)).limit(1);
  if (!result[0]) return null;
  return renderToStaticMarkup(
    createElement(Render, { config: formRenderConfig, data: result[0].content as Data }),
  );
}
