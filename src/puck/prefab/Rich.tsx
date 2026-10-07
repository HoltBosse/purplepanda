import type { ComponentConfig } from "@puckeditor/core";
import { RichTextMenu } from "@puckeditor/core";
import { Subscript as SubscriptExtension } from "@tiptap/extension-subscript";
import { Superscript as SuperscriptExtension } from "@tiptap/extension-superscript";
import { Placeholder } from '@tiptap/extensions';
import type { Editor } from "@tiptap/react";
import type { ReactNode, SyntheticEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import * as z from "zod";
import { units } from "../../theme/units.js";
import { currentTheme } from "../component-fields/ThemeFields.js";
import { ChevronDown, Link as LinkIcon, Subscript, Superscript, Type } from "../icons.js";
import { RichTextStyle } from "./rich-text-style.js";

type RichProps = {
  content: ReactNode;
};

// The richtext field stores its value as an HTML string (RichText = string | ReactNode; only
// resolved to a ReactNode at render time), so this checks for real text rather than markup —
// "<p></p>" and "<p><br></p>" are both empty-looking editor states tiptap can produce.
function hasVisibleText(html: unknown): boolean {
  return typeof html === "string" && html.replace(/<[^>]*>/g, "").trim().length > 0;
}

function toPropsSchema() {
  return z
    .object({
      content: z.unknown().refine(hasVisibleText, "Required"),
    })
    .loose();
}

// A toolbar button that opens a menu portalled to <body>, anchored under the button's right edge
// and closed by any pointerdown outside both. `children` gets `close` for the menu items to call.
function RteDropdown({
  icon,
  active,
  readOnly,
  title,
  menuClassName,
  dataAttrs,
  children,
}: {
  icon: ReactNode;
  active: boolean;
  readOnly?: boolean | undefined;
  title: string;
  menuClassName: string;
  dataAttrs?: Record<`data-${string}`, boolean>;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!open) return;

    const updatePosition = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) setPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    };
    updatePosition();

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };

    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-flex" {...dataAttrs}>
      <RichTextMenu.Control
        icon={
          <span className="inline-flex items-center gap-0.5">
            {icon}
            <ChevronDown size={12} />
          </span>
        }
        active={active}
        disabled={!!readOnly}
        onClick={() => setOpen((prev) => !prev)}
        title={title}
      />
      {open &&
        position &&
        createPortal(
          <ul
            ref={menuRef}
            data-puck-rte-menu
            className={`fixed z-50 ${menuClassName} list-none rounded-md border border-gray-200 bg-white p-1 shadow-md dark:border-gray-700 dark:bg-gray-800`}
            style={{ top: position.top, right: position.right }}
          >
            {children(() => setOpen(false))}
          </ul>,
          document.body,
        )}
    </div>
  );
}

function SuperSubMenu({
  editor,
  isSuperscript,
  isSubscript,
  readOnly,
}: {
  editor: Editor | null;
  isSuperscript?: boolean;
  isSubscript?: boolean;
  readOnly?: boolean;
}) {
  const ActiveIcon = isSubscript ? Subscript : Superscript;

  return (
    <RteDropdown
      icon={<ActiveIcon />}
      active={!!(isSuperscript || isSubscript)}
      readOnly={readOnly}
      title="Superscript / Subscript"
      menuClassName="min-w-36"
    >
      {(close) => {
        const toggleSuperscript = () => {
          const chain = editor?.chain().focus();
          if (isSuperscript) chain?.unsetSuperscript().run();
          else chain?.unsetSubscript().setSuperscript().run();
          close();
        };

        const toggleSubscript = () => {
          const chain = editor?.chain().focus();
          if (isSubscript) chain?.unsetSubscript().run();
          else chain?.unsetSuperscript().setSubscript().run();
          close();
        };

        return (
          <>
            <li>
              <button type="button" className={`flex w-full items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${isSuperscript ? "font-semibold" : ""}`} onClick={toggleSuperscript}>
                <Superscript size={16} />
                Superscript
              </button>
            </li>
            <li>
              <button type="button" className={`flex w-full items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${isSubscript ? "font-semibold" : ""}`} onClick={toggleSubscript}>
                <Subscript size={16} />
                Subscript
              </button>
            </li>
          </>
        );
      }}
    </RteDropdown>
  );
}

const TEXT_STYLE_FLAG = "textStyle:";

function textStyleFlags(editor: Editor | null | undefined): Record<string, boolean> {
  const id = (editor?.getAttributes("paragraph").ppTextStyle ?? editor?.getAttributes("heading").ppTextStyle) as string | null | undefined;
  return id ? { [`${TEXT_STYLE_FLAG}${id}`]: true } : {};
}

function currentTextStyle(state: Record<string, unknown> | null | undefined): string | null {
  const key = Object.keys(state ?? {}).find((k) => k.startsWith(TEXT_STYLE_FLAG) && state?.[k]);
  return key ? key.slice(TEXT_STYLE_FLAG.length) : null;
}

// The site theme's text styles, applied to the paragraphs and headings in the selection (see
// ./rich-text-style.ts). "Default" clears it, so the element takes its usual style again.
function TextStyleMenu({ editor, current, readOnly }: { editor: Editor | null; current: string | null; readOnly?: boolean }) {
  const styles = currentTheme().textStyles;
  const currentName = styles.find((s) => s.id === current)?.name;

  return (
    <RteDropdown
      icon={<Type />}
      active={!!current}
      readOnly={readOnly}
      title={currentName ? `Text style: ${currentName}` : "Text style"}
      menuClassName="min-w-44 max-h-80 overflow-y-auto"
      dataAttrs={{ "data-rich-text-style-menu": true }}
    >
      {(close) => {
        const choose = (id: string | null) => {
          editor?.chain().focus().setPpTextStyle(id).run();
          close();
        };

        return (
          <>
            <li>
              <button type="button" className={`flex w-full items-center rounded px-2 py-1 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${current ? "" : "font-semibold"}`} onClick={() => choose(null)}>
                Default
              </button>
            </li>
            {styles.map((style) => (
              <li key={style.id}>
                <button
                  type="button"
                  data-text-style-option={style.id}
                  className={`flex w-full items-center rounded px-2 py-1 text-left hover:bg-gray-100 dark:hover:bg-gray-700 ${current === style.id ? "bg-gray-100 dark:bg-gray-700" : ""}`}
                  style={{ fontFamily: style.fontFamily, fontWeight: style.weight, fontSize: `min(${units(style.size)}, 1.25rem)`, lineHeight: 1.3 }}
                  onClick={() => choose(style.id)}
                >
                  {style.name}
                </button>
              </li>
            ))}
          </>
        );
      }}
    </RteDropdown>
  );
}

function LinkMenu({
  editor,
  isLink,
  readOnly,
}: {
  editor: Editor | null;
  isLink?: boolean;
  readOnly?: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [url, setUrl] = useState("");
  const [newTab, setNewTab] = useState(false);

  const openDialog = () => {
    const attrs = editor?.getAttributes("link") ?? {};
    setUrl(typeof attrs.href === "string" ? attrs.href : "");
    setNewTab(attrs.target === "_blank");
    dialogRef.current?.showModal();
  };

  const applyLink = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = url.trim();
    const chain = editor?.chain().focus().extendMarkRange("link");
    if (!trimmed) chain?.unsetLink().run();
    else chain?.setLink({ href: trimmed, target: newTab ? "_blank" : null }).run();
    dialogRef.current?.close();
  };

  const removeLink = () => {
    editor?.chain().focus().extendMarkRange("link").unsetLink().run();
    dialogRef.current?.close();
  };

  return (
    <>
      <RichTextMenu.Control
        icon={<LinkIcon />}
        active={!!isLink}
        disabled={!!readOnly}
        onClick={openDialog}
        title="Link"
      />
      {createPortal(
        // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop-click-to-close on a native <dialog>, which already closes on Escape — there's no keyboard equivalent for "click outside the box" to add
        <dialog
          ref={dialogRef}
          className="fixed inset-0 m-auto w-80 rounded-md border border-gray-200 bg-white p-4 shadow-lg backdrop:bg-black/30 dark:border-gray-700 dark:bg-gray-800"
          onClick={(event) => {
            if (event.target === dialogRef.current) dialogRef.current?.close();
          }}
        >
          <form onSubmit={applyLink} className="flex flex-col gap-3">
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
              URL
              <input
                type="text"
                autoFocus
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                className="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-900"
              />
            </label>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
              Open in
              <select
                value={newTab ? "_blank" : "_self"}
                onChange={(event) => setNewTab(event.target.value === "_blank")}
                className="mt-1 block w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-900"
              >
                <option value="_self">Current tab</option>
                <option value="_blank">New tab</option>
              </select>
            </label>
            <div className="flex items-center justify-between pt-1">
              <div>
                {isLink && (
                  <button type="button" className="btn btn-xs btn-error" onClick={removeLink}>
                    Remove
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button type="button" className="btn btn-xs" onClick={() => dialogRef.current?.close()}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-xs btn-primary">
                  Apply
                </button>
              </div>
            </div>
          </form>
        </dialog>,
        document.body,
      )}
    </>
  );
}

// Exported for unit testing; not part of the package's public API.
export function RichTextMenuScrollFade({ children }: { children: ReactNode }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  useEffect(() => {
    const scrollEl = wrapperRef.current?.querySelector<HTMLElement>("[data-puck-rte-menu]");
    if (!scrollEl) return;

    const updateFade = () => {
      setShowLeftFade(scrollEl.scrollLeft > 0);
      setShowRightFade(scrollEl.scrollLeft + scrollEl.clientWidth < scrollEl.scrollWidth - 1);
    };
    updateFade();

    scrollEl.addEventListener("scroll", updateFade);
    const resizeObserver = new ResizeObserver(updateFade);
    resizeObserver.observe(scrollEl);

    return () => {
      scrollEl.removeEventListener("scroll", updateFade);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      {children}
      {showLeftFade && (
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-6"
          style={{ background: `linear-gradient(to left, var(--puck-color-surface), color-mix(in srgb, var(--puck-color-text-secondary), var(--puck-color-surface) 50%))` }}
        />
      )}
      {showRightFade && (
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-6"
          style={{ background: `linear-gradient(to right, var(--puck-color-surface), color-mix(in srgb, var(--puck-color-text-secondary), var(--puck-color-surface) 50%))` }}
        />
      )}
    </div>
  );
}

const Rich: ComponentConfig<RichProps> = {
  propsSchema: toPropsSchema,
  bindableFields: {
    content: { label: "Text", fieldTypes: ["text", "textarea", "richtext"] },
  },
  fields: {
    content: {
      type: "richtext",
      label: "Text",
      options: {
        heading: { levels: [1, 2, 3, 4] },
        link: { openOnClick: false, HTMLAttributes: { target: null } },
      },
      tiptap: {
        extensions: [
          Placeholder.configure({ placeholder: "Type something..." }),
          SuperscriptExtension,
          SubscriptExtension,
          RichTextStyle,
        ],
        selector: (ctx) => ({
          isSuperscript: !!ctx.editor?.isActive("superscript"),
          isSubscript: !!ctx.editor?.isActive("subscript"),
          isLink: !!ctx.editor?.isActive("link"),
          // Puck's editor state only holds booleans, so the current text style is one flag per style.
          ...textStyleFlags(ctx.editor),
        }),
      },
      renderMenu: ({ children, editor, editorState, readOnly }) => (
        <RichTextMenuScrollFade>
          <RichTextMenu>
            {/* Render default menu */}
            {children}
            <RichTextMenu.Group>
              <SuperSubMenu
                editor={editor}
                isSuperscript={!!editorState?.isSuperscript}
                isSubscript={!!editorState?.isSubscript}
                readOnly={!!readOnly}
              />
              <TextStyleMenu editor={editor} current={currentTextStyle(editorState)} readOnly={!!readOnly} />
              <LinkMenu editor={editor} isLink={!!editorState?.isLink} readOnly={!!readOnly} />
            </RichTextMenu.Group>
          </RichTextMenu>
        </RichTextMenuScrollFade>
      ),
    },
  },
  defaultProps: {
    content: "",
  },
  render: ({ content, puck }) => {
    return (
      // pp-rich: the site theme's text styles and scheme colors (see theme/css.ts).
      <div className={`prose pp-rich max-w-none ${puck?.isEditing ? "rich-placeholder-wrap" : ""}`}>
        {content}
      </div>
    );
  },
};

export default Rich;
