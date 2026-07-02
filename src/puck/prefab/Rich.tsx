import type { ComponentConfig } from "@puckeditor/core";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Placeholder } from '@tiptap/extensions';
import { RichTextMenu } from "@puckeditor/core";
import type { Editor } from "@tiptap/react";
import { Superscript as SuperscriptExtension } from "@tiptap/extension-superscript";
import { Subscript as SubscriptExtension } from "@tiptap/extension-subscript";
import { ChevronDown, Subscript, Superscript } from "lucide-react";

type RichProps = {
  content: ReactNode;
};

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
      if (containerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
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

  const toggleSuperscript = () => {
    const chain = editor?.chain().focus();
    if (isSuperscript) chain?.unsetSuperscript().run();
    else chain?.unsetSubscript().setSuperscript().run();
    setOpen(false);
  };

  const toggleSubscript = () => {
    const chain = editor?.chain().focus();
    if (isSubscript) chain?.unsetSubscript().run();
    else chain?.unsetSuperscript().setSubscript().run();
    setOpen(false);
  };

  const ActiveIcon = isSubscript ? Subscript : Superscript;

  return (
    <div ref={containerRef} className="relative inline-flex">
      <RichTextMenu.Control
        icon={
          <span className="inline-flex items-center gap-0.5">
            <ActiveIcon />
            <ChevronDown size={12} />
          </span>
        }
        active={!!(isSuperscript || isSubscript)}
        disabled={!!readOnly}
        onClick={() => setOpen((prev) => !prev)}
        title="Superscript / Subscript"
      />
      {open &&
        position &&
        createPortal(
          <ul
            ref={menuRef}
            data-puck-rte-menu
            className="fixed z-50 min-w-36 list-none rounded-md border border-gray-200 bg-white p-1 shadow-md dark:border-gray-700 dark:bg-gray-800"
            style={{ top: position.top, right: position.right }}
          >
            <li>
              <button
                type="button"
                className={`flex w-full items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                  isSuperscript ? "font-semibold" : ""
                }`}
                onClick={toggleSuperscript}
              >
                <Superscript size={16} />
                Superscript
              </button>
            </li>
            <li>
              <button
                type="button"
                className={`flex w-full items-center gap-2 rounded px-2 py-1 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${
                  isSubscript ? "font-semibold" : ""
                }`}
                onClick={toggleSubscript}
              >
                <Subscript size={16} />
                Subscript
              </button>
            </li>
          </ul>,
          document.body,
        )}
    </div>
  );
}

function RichTextMenuScrollFade({ children }: { children: ReactNode }) {
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
  fields: {
    content: {
      type: "richtext",
      options: {
        heading: { levels: [1, 2, 3, 4] },
      },
      tiptap: {
        extensions: [
          Placeholder.configure({ placeholder: "Type something..." }),
          SuperscriptExtension,
          SubscriptExtension,
        ],
        selector: (ctx) => ({
          isSuperscript: !!ctx.editor?.isActive("superscript"),
          isSubscript: !!ctx.editor?.isActive("subscript"),
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
      <div className={`prose max-w-none${puck?.isEditing ? " rich-placeholder-wrap" : ""}`}>
        {content}
      </div>
    );
  },
};

export default Rich;
