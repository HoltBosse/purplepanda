import externalPuckConfig from "virtual:purplepanda/puck-config";
import type { Config, Data } from "@puckeditor/core";
import { Render } from "@puckeditor/core";
import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getDb } from "../../db/db.js";
import { forms } from "../../db/schema.js";
import { filterConfigByLocation, IslandRenderContext, wrapConfigWithIslands } from "../index.js";
import { resolveDataForSSR } from "../server-data-wrapper.js";
import { createCsrfToken, renderSpamGuardFieldsHtml } from "./spam-guard.js";

const hostConfig = (externalPuckConfig as Config) ?? ({} as Config);
// Island wrapping so any form field flagged `island: true` (e.g. Select) emits its hydration
// marker into the static form HTML. The marker is injected into a PageRenderer page by FormEmbed,
// where the front-end runtime finds and hydrates it.
const filteredFormConfig = wrapConfigWithIslands(filterConfigByLocation(hostConfig, "form"));

export async function getFormHtml(id: string): Promise<string | null> {
  const db = getDb();
  const result = await db.select({ content: forms.content }).from(forms).where(eq(forms.id, id)).limit(1);
  if (!result[0]) return null;

  // Runs each field's `data` resolver (e.g. Turnstile's site key lookup) server-side before the
  // synchronous render pass below, since components can't await inside render themselves.
  const resolvedData = await resolveDataForSSR(filteredFormConfig, result[0].content as Data);

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

  // Nested field islands (e.g. Select) render isolated too, matching hydrateIslands' per-marker
  // hydrateRoot calls against this same _html string — see IslandRenderContext for why.
  const html = renderToStaticMarkup(
    createElement(
      IslandRenderContext.Provider,
      { value: renderToStaticMarkup },
      createElement(Render, { config: formRenderConfig, data: resolvedData }),
    ),
  );

  const hasFileInput = /type=(["'])file\1/i.test(html);
  const withEnctype = hasFileInput ? html.replace("<form ", '<form enctype="multipart/form-data" ') : html;

  const csrfToken = await createCsrfToken(id);
  return withEnctype.replace(/(<form[^>]*>)/, `$1${renderSpamGuardFieldsHtml(csrfToken)}`);
}
