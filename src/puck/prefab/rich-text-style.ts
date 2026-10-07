import { Extension } from "@tiptap/core";
import { ID_PATTERN } from "../../theme/ids.js";

// Lets a paragraph or heading inside rich text take one of the site theme's text styles (a
// "Pull quote", an "Eyebrow"), stored on the element as data-text-style="<id>". The theme CSS
// styles `.pp-rich [data-text-style="<id>"]` (see theme/css.ts), and the theme screen counts these
// toward a text style's usage. Registered on the Rich field itself, so the published render — which
// re-parses the stored HTML through the same extensions — keeps the attribute too.

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    ppTextStyle: {
      // Sets (or with null, clears) the text style of every paragraph and heading in the selection.
      setPpTextStyle: (id: string | null) => ReturnType;
    };
  }
}

export const TEXT_STYLE_ATTRIBUTE = "data-text-style";

export const RichTextStyle = Extension.create({
  name: "ppTextStyle",

  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          ppTextStyle: {
            default: null,
            parseHTML: (element) => {
              const id = element.getAttribute(TEXT_STYLE_ATTRIBUTE);
              return id && ID_PATTERN.test(id) ? id : null;
            },
            renderHTML: (attributes) => (attributes.ppTextStyle ? { [TEXT_STYLE_ATTRIBUTE]: attributes.ppTextStyle } : {}),
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      // Written out rather than as two updateAttributes calls: those fail for whichever of the two
      // node types the selection doesn't contain, which fails the whole command.
      setPpTextStyle:
        (id) =>
        ({ state, tr, dispatch }) => {
          const targets = new Map<number, (typeof state.doc)["attrs"]>();
          const take = (node: (typeof state.doc), pos: number) => {
            if (node.type.name === "paragraph" || node.type.name === "heading") targets.set(pos, node.attrs);
          };
          for (const { $from, $to } of state.selection.ranges) {
            state.doc.nodesBetween($from.pos, $to.pos, (node, pos) => take(node, pos));
            // A bare cursor sits inside its block rather than spanning it.
            if ($from.depth > 0) take($from.parent, $from.before());
          }
          if (targets.size === 0) return false;
          if (dispatch) for (const [pos, attrs] of targets) tr.setNodeMarkup(pos, undefined, { ...attrs, ppTextStyle: id });
          return true;
        },
    };
  },
});
