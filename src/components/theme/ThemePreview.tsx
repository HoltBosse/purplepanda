import type { Data } from "@puckeditor/core";
import { useEffect, useMemo } from "react";
import { ensureStylesheet } from "../../form/fields/font-picker-core.js";
import { escapeHtml } from "../../string/index.js";
import { type Mode, type Theme, themeFontLinks, themeToCss } from "../../theme/index.js";
import PageRenderer from "../PageRenderer.js";

// The theme screen's preview: real Puck components (Section, Card, Rich, Button)
// rendered by the same PageRenderer as the published site, styled by the working copy's CSS
// confined to the preview element. What it shows can't drift from what the site renders.

export const PREVIEW_ID = "pp-theme-preview";

const COPY: Record<string, [string, string]> = {
  default: ["Plan a weekend up north", "Small towns, quiet trails, and a lake around every bend. Here is where to start."],
  muted: ["Where to stay", "Cabins, inns, and lakeside campgrounds, sorted by region."],
  brand: ["Get the trip guide", "Free maps and seasonal picks, mailed to your door."],
  inverted: ["Northern lights season", "Best viewing runs October through March on clear nights."],
};
const FALLBACK_COPY: [string, string] = ["A section heading", "Body text takes the scheme's text color without any setting of its own."];

// One Section per scheme, each holding a heading, body text, every button variant and a card. The
// first also holds a card in a gradient scheme, to show that only the element carrying a scheme
// paints its gradient.
export function previewData(theme: Theme): Data {
  const gradientScheme = theme.schemes.find((s) => s.gradient);
  const buttons = (prefix: string) =>
    theme.buttons.variants.map((v) => ({
      type: "Button",
      props: { id: `${prefix}-btn-${v.id}`, children: v.name, href: "", variant: v.id, image: { file: null, position: "start", gap: 2 } },
    }));
  const content = theme.schemes.map((s, index) => {
    const [heading, body] = COPY[s.id] ?? FALLBACK_COPY;
    const id = `pv-${s.id}`;
    const featured =
      index === 0 && gradientScheme && gradientScheme.id !== s.id
        ? [
            { type: "Space", props: { id: `${id}-space-2`, size: 4, direction: "vertical" } },
            {
              type: "Card",
              props: {
                id: `${id}-featured`,
                scheme: gradientScheme.id,
                content: [
                  {
                    type: "Rich",
                    props: {
                      id: `${id}-featured-p`,
                      content: `<h3>Featured card</h3><p>This card uses the ${escapeHtml(gradientScheme.name)} scheme, so it paints the gradient itself.</p>`,
                    },
                  },
                  { type: "Button", props: { id: `${id}-featured-btn`, children: "Book a tour", href: "", variant: "primary" } },
                ],
              },
            },
          ]
        : [];
    return {
      type: "Section",
      props: {
        id,
        scheme: s.id,
        paddingY: 7,
        paddingX: 5,
        content: [
          { type: "Rich", props: { id: `${id}-p`, content: `<h2>${escapeHtml(heading)}</h2><p>${escapeHtml(body)}</p>` } },
          {
            type: "Flex",
            props: { id: `${id}-buttons`, direction: "row", justifyContent: "start", alignItems: "center", gap: 2, wrap: "wrap", items: buttons(id) },
          },
          { type: "Space", props: { id: `${id}-space`, size: 5, direction: "vertical" } },
          {
            type: "Card",
            props: {
              id: `${id}-card`,
              scheme: "",
              content: [
                { type: "Rich", props: { id: `${id}-card-p`, content: "<h3>Card in this section</h3><p>Picks up the section's colors unless given its own scheme.</p>" } },
              ],
            },
          },
          ...featured,
        ],
      },
    };
  });
  return { root: { props: {} }, content } as unknown as Data;
}

export function ThemePreview({ theme, mode }: { theme: Theme; mode: Mode }) {
  const css = useMemo(() => themeToCss(theme, { scope: `#${PREVIEW_ID}` }), [theme]);
  const data = useMemo(() => previewData(theme), [theme]);

  useEffect(() => {
    for (const href of themeFontLinks(theme)) ensureStylesheet(href);
  }, [theme]);

  return (
    <>
      <style>{css}</style>
      {/* Buttons in the preview are links to nowhere; keep a stray click from navigating away. */}
      <div id={PREVIEW_ID} data-pp-mode={mode} onClickCapture={(e) => e.preventDefault()}>
        <PageRenderer pageData={data} />
      </div>
    </>
  );
}
