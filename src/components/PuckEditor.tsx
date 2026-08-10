import { Button, createUsePuck, Puck } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import "../styles/puck-theme.css";
import type { Config, Data, Dictionary, Overrides, PuckContext } from "@puckeditor/core";
import { Render } from "@puckeditor/core";
import type React from "react";
import { cloneElement, createContext, isValidElement, useCallback, useContext, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { extractFamilyFromLink } from "../form/fields/font-utils.js";
import { Save } from "../puck/icons.js";

const ROOT_SLOT_NAME = "default-zone";

const SLOT_ZONE_STYLE: React.CSSProperties = {
  flexGrow: 1,
  minWidth: 0,
  width: "100%",
  maxWidth: "100%",
};

// The template is drawn with Puck's read-only <Render>, but the editable zone can't simply be
// rendered inside it: DropZone resolves its zone as `${areaId}:${zone}` from React context at its
// render position, so nested under a template component it would look for `Margin-xyz:default-zone`
// instead of the page's `root:default-zone` and come up empty. Instead the root portals the real
// drop zone into a standalone container element, and TemplateSlot adopts that container into the
// template tree. The portal keeps the drop zone in the root's context (so the zone resolves) while
// its DOM sits inside the template at any depth.
//
// The container is a plain detached DOM node rather than React state on purpose: Puck rebuilds slot
// components on every render (getSlotTransform returns a fresh component identity), so anything
// inside a template slot remounts constantly. A ref that set state here would loop
// detach -> setState -> rerender -> remount -> detach until React bailed out with "Maximum update
// depth exceeded". Appending a stable container involves no React state, so remounts are harmless.
const TemplateSlotContainerContext = createContext<HTMLElement | null>(null);

function TemplateSlotRenderer() {
  const container = useContext(TemplateSlotContainerContext);

  const adoptContainer = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node || !container || node.contains(container)) return;
      node.appendChild(container);
    },
    [container],
  );

  return <div ref={adoptContainer} style={{ display: "contents" }} />;
}

const useTypedPuck = createUsePuck();

interface FontLinks {
  headingFontLink: string | undefined;
  bodyFontLink: string | undefined;
}

function createOverrides(onSave?: (data: Data) => void, fontLinks?: FontLinks): Partial<Overrides<Config>> {
  const headingFontFamily = extractFamilyFromLink(fontLinks?.headingFontLink);
  const bodyFontFamily = extractFamilyFromLink(fontLinks?.bodyFontLink);

  return {
    headerActions: ({ children }) => {
      const appStateData = useTypedPuck((state) => state.appState.data);

      const saveButton = onSave ? (
        <Button data-puck-save icon={<Save size="14px" />} onClick={() => onSave(appStateData)}>
          Save
        </Button>
      ) : null;

      if (isValidElement(children)) {
        return (
          <>
            {saveButton}
            {cloneElement(children as any, { "data-puck-publish": "" })}
          </>
        );
      }

      return (
        <>
          {saveButton}
          {children}
        </>
      );
    },

    iframe: ({ children, document }) => {
      // biome-ignore lint/correctness/useExhaustiveDependencies: fontLinks?.headingFontLink/bodyFontLink are read below via a for-of over an array literal, which biome doesn't trace — removing them would let fontLinks change without re-running the effect
      useEffect(() => {
        if (!document) return;

        // Puck's AutoFrame copies every attribute from the parent page's <html> onto the
        // iframe's (to mirror host styling), which stomps this back to the parent's theme
        // right after we set it — Puck's sync effect runs as a parent of this one, so it
        // always fires later. A MutationObserver reasserts "false" whenever that happens.
        const enforceLightTheme = () => {
          if (document.documentElement.getAttribute("data-theme") !== "false") {
            document.documentElement.setAttribute("data-theme", "false");
          }
        };
        enforceLightTheme();
        const themeObserver = new MutationObserver(enforceLightTheme);
        themeObserver.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ["data-theme"],
        });

        document.documentElement.style.setProperty(
          "--pp-body-font",
          bodyFontFamily ? `'${bodyFontFamily}', sans-serif` : "inherit",
        );
        document.documentElement.style.setProperty(
          "--pp-heading-font",
          headingFontFamily ? `'${headingFontFamily}', sans-serif` : "inherit",
        );

        if (!document.getElementById("purplepanda-font-styles")) {
          const style = document.createElement("style");
          style.id = "purplepanda-font-styles";
          style.textContent =
            "body { font-family: var(--pp-body-font, inherit); } " +
            "h1, h2, h3, h4, h5, h6 { font-family: var(--pp-heading-font, inherit); }";
          document.head.appendChild(style);
        }

        for (const href of [fontLinks?.bodyFontLink, fontLinks?.headingFontLink]) {
          if (!href || document.head.querySelector(`link[href="${href}"]`)) continue;
          const link = document.createElement("link");
          link.rel = "stylesheet";
          link.href = href;
          document.head.appendChild(link);
        }

        return () => themeObserver.disconnect();
      }, [document, fontLinks?.headingFontLink, fontLinks?.bodyFontLink]);

      return <>{children}</>;
    },
  };
}

interface PuckEditorProps {
  config: Config;
  data: Data;
  templateData?: Data;
  onPublish: (data: Data) => void;
  onSave?: (data: Data) => void;
  headingFontLink?: string;
  bodyFontLink?: string;
  dictionary?: Dictionary;
}

function hasTemplateSlot(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => hasTemplateSlot(item));
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;

    if (record.type === "TemplateSlot") {
      return true;
    }

    return Object.values(record).some((item) => hasTemplateSlot(item));
  }

  return false;
}

function ensureTemplateSlot(data: Data): Data {
  if (hasTemplateSlot(data)) {
    return data;
  }

  return {
    ...data,
    content: [...(data.content ?? []), { type: "TemplateSlot", props: { id: "TemplateSlot-fallback" } }],
  };
}

export default function PuckEditor({ config, data, templateData, onPublish, onSave, headingFontLink, bodyFontLink, dictionary }: PuckEditorProps) {
  const overrides = useMemo(
    () => createOverrides(onSave, { headingFontLink, bodyFontLink }),
    [onSave, headingFontLink, bodyFontLink],
  );

  // Memoized because it feeds the root render below: a fresh object each render would rebuild the
  // root component's identity and remount the whole canvas on every keystroke.
  const normalizedTemplateData = useMemo(
    () => (templateData ? ensureTemplateSlot(templateData) : undefined),
    [templateData],
  );

  // Config used to draw the template itself: same host config, plus the TemplateSlot placeholder
  // that marks where the page's editable zone gets portalled in.
  const templateRenderConfig = useMemo(
    () => ({
      ...config,
      components: {
        ...(config.components ?? {}),
        TemplateSlot: { render: TemplateSlotRenderer },
      },
    }),
    [config],
  );

  // Detached container that the live drop zone is portalled into; TemplateSlot appends it into the
  // template. Created once so the portal target — and therefore the drop zone subtree — is stable.
  const slotContainer = useMemo(() => {
    if (typeof document === "undefined") return null;
    const el = document.createElement("div");
    el.style.display = "contents";
    return el;
  }, []);

  // Held as a memoized element, not re-created inside the root's render: passing React the very same
  // element reference lets it bail out of re-rendering the template on every root render, which
  // otherwise remounts the whole template subtree (and moves the drop zone's DOM) constantly.
  const templateElement = useMemo(() => {
    if (!normalizedTemplateData || !slotContainer) return null;
    return (
      <TemplateSlotContainerContext.Provider value={slotContainer}>
        <Render config={templateRenderConfig} data={normalizedTemplateData} />
      </TemplateSlotContainerContext.Provider>
    );
  }, [normalizedTemplateData, slotContainer, templateRenderConfig]);

  const configCopy = useMemo(() => {
    const nextConfig = {
      ...config,
      root: {
        ...(config.root ?? {}),
      },
    };

    nextConfig.root = {
      ...(nextConfig.root ?? {}),
      render: ({
        puck: { renderDropZone },
      }: {
        puck: Pick<PuckContext, "renderDropZone">;
      }) => {
        const liveZone = renderDropZone({ zone: ROOT_SLOT_NAME, style: SLOT_ZONE_STYLE });

        return (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              minHeight: "100%",
              width: "100%",
              maxWidth: "100%",
            }}
          >
            {templateElement && slotContainer ? (
              <>
                {templateElement}
                {createPortal(liveZone, slotContainer)}
              </>
            ) : (
              liveZone
            )}
          </div>
        );
      },
    };

    return nextConfig;
  }, [config, templateElement, slotContainer]);

  return (
    <div style={{ position: "relative", width: "100%", maxWidth: "100%", overflowX: "clip" }}>
      <a
        href="/admin"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          zIndex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "67px",
          height: "67px",
        }}
      >
        <img src="/admin/assets/favicon.svg" alt="Admin" style={{ height: "28px", width: "28px" }} />
      </a>
      <Puck config={configCopy} data={data} onPublish={onPublish} overrides={overrides} {...(dictionary ? { dictionary } : {})} />
    </div>
  );
}
