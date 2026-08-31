import { Button, createUsePuck, Puck } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import "../styles/puck-theme.css";
import type { Config, Data, Dictionary, Overrides, PuckAction, PuckContext } from "@puckeditor/core";
import { Render } from "@puckeditor/core";
import type React from "react";
import { cloneElement, createContext, isValidElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type * as z from "zod";
import { extractFamilyFromLink } from "../form/fields/font-utils.js";
import { ChevronDown, Save } from "../puck/icons.js";
import { validateContentTree } from "../puck/validate-content.js";
import { ensureTemplateSlot } from "./template-slot.js";

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

function createOverrides(
  config: Config,
  onSave: ((data: Data) => void) | undefined,
  fontLinks: FontLinks | undefined,
  // Populated from inside headerActions below (the only override here rendered unconditionally,
  // as soon as Puck mounts) so guardedOnPublish — defined outside Puck's tree, in plain
  // PuckEditor component scope — can still dispatch into it imperatively once a Publish attempt
  // fails, to jump the side panel to the root fields view. Zustand's dispatch is referentially
  // stable across renders, so caching it here is safe.
  dispatchRef: { current: ((action: PuckAction) => void) | null },
  rootPropsSchema: ((props: Record<string, unknown>) => z.ZodTypeAny) | undefined,
  // Commit is an alternate publish action offered only while authoring a brand-new page/content
  // item (see PuckEditor's isNew prop) — it POSTs to the same endpoint as Publish but persists the
  // row as state -1 instead of going live. Undefined onCommit (editing an existing item) hides it.
  commit: { isNew: boolean | undefined; onCommit: ((data: Data) => void) | undefined } | undefined,
): Partial<Overrides<Config>> {
  const headingFontFamily = extractFamilyFromLink(fontLinks?.headingFontLink);
  const bodyFontFamily = extractFamilyFromLink(fontLinks?.bodyFontLink);

  return {
    headerActions: ({ children }) => {
      const appStateData = useTypedPuck((state) => state.appState.data);
      dispatchRef.current = useTypedPuck((state) => state.dispatch);

      const showCommitMenu = Boolean(commit?.isNew && commit.onCommit);

      const [commitMenuOpen, setCommitMenuOpen] = useState(false);
      const commitTriggerRef = useRef<HTMLButtonElement | null>(null);
      const commitMenuRef = useRef<HTMLDivElement | null>(null);
      const [commitMenuPosition, setCommitMenuPosition] = useState<{ top: number; right: number } | null>(null);

      // The header sits inside Puck's own scroll/clip container (._PuckLayout-header has
      // overflow:auto/hidden), so an absolutely-positioned dropdown-content nested in the normal
      // DOM tree gets clipped to the header's bounds and painted behind the side panels. Portaling
      // a `position: fixed` menu straight to document.body — positioned from the trigger's own
      // getBoundingClientRect — escapes both the clipping ancestor and the stacking order entirely.
      useEffect(() => {
        if (!commitMenuOpen) return;

        const updatePosition = () => {
          const rect = commitTriggerRef.current?.getBoundingClientRect();
          if (!rect) return;
          setCommitMenuPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
        };
        updatePosition();

        const handlePointerDown = (event: PointerEvent) => {
          const target = event.target as Node;
          if (commitTriggerRef.current?.contains(target) || commitMenuRef.current?.contains(target)) return;
          setCommitMenuOpen(false);
        };
        const handleKeyDown = (event: KeyboardEvent) => {
          if (event.key === "Escape") setCommitMenuOpen(false);
        };

        window.addEventListener("resize", updatePosition);
        window.addEventListener("scroll", updatePosition, true);
        document.addEventListener("pointerdown", handlePointerDown, true);
        document.addEventListener("keydown", handleKeyDown);

        return () => {
          window.removeEventListener("resize", updatePosition);
          window.removeEventListener("scroll", updatePosition, true);
          document.removeEventListener("pointerdown", handlePointerDown, true);
          document.removeEventListener("keydown", handleKeyDown);
        };
      }, [commitMenuOpen]);

      const commitTrigger = showCommitMenu ? (
        <button
          key="commit-trigger"
          type="button"
          ref={commitTriggerRef}
          data-puck-commit-trigger
          aria-haspopup="menu"
          aria-expanded={commitMenuOpen}
          aria-label="More publish options"
          onClick={() => setCommitMenuOpen((open) => !open)}
        >
          <ChevronDown size={14} />
        </button>
      ) : null;

      const commitPortal =
        showCommitMenu && commitMenuOpen && commitMenuPosition
          ? createPortal(
              <div
                ref={commitMenuRef}
                role="menu"
                className="w-40 rounded-box border border-base-300 bg-base-200 p-2 shadow-lg menu"
                style={{ position: "fixed", zIndex: 1000, top: commitMenuPosition.top, right: commitMenuPosition.right }}
              >
                <button
                  type="button"
                  role="menuitem"
                  data-puck-commit
                  className="w-full text-left"
                  onClick={() => {
                    setCommitMenuOpen(false);
                    commit?.onCommit?.(appStateData);
                  }}
                >
                  Save
                </button>
              </div>,
              document.body,
            )
          : null;

      const saveButton = onSave ? (
        <Button data-puck-save icon={<Save size="14px" />} onClick={() => onSave(appStateData)}>
          Save
        </Button>
      ) : null;

      // Recomputed from the live appState.data on every render (same tree walk
      // guardedOnSave/guardedOnPublish run before calling through), rather than a snapshot taken
      // at the last Save/Publish click — so the count (and the field-by-field tooltip) drops as
      // soon as an author actually fixes something, the same way the fieldLabel outline above
      // now does, instead of staying stuck until the next click.
      const liveErrors = useMemo(() => validateContentTree(config, appStateData, { rootPropsSchema }), [appStateData]);

      // The full per-field messages are in the title tooltip since there's no toast/panel system
      // to host a longer list inline in the header.
      const validationBadge =
        liveErrors.length > 0 ? (
          <span
            role="alert"
            data-puck-validation-errors
            title={liveErrors.map((error) => `${error.componentType} — ${error.field}: ${error.message}`).join("\n")}
            style={{
              alignSelf: "center",
              marginRight: "0.5rem",
              fontSize: "0.8rem",
              color: "var(--color-error)",
              cursor: "help",
            }}
          >
            {liveErrors.length} field{liveErrors.length === 1 ? "" : "s"} need attention
          </span>
        ) : null;

      if (isValidElement(children)) {
        const publishButton = showCommitMenu ? (
          <div key="publish-group" className="inline-flex items-stretch">
            {cloneElement(children as any, { "data-puck-publish": "", "data-puck-publish-grouped": "" })}
            {commitTrigger}
          </div>
        ) : (
          cloneElement(children as any, { "data-puck-publish": "" })
        );

        return (
          <>
            {validationBadge}
            {saveButton}
            {publishButton}
            {commitPortal}
          </>
        );
      }

      return (
        <>
          {validationBadge}
          {saveButton}
          {children}
          {showCommitMenu ? (
            <div key="publish-group" className="inline-flex items-stretch">
              {commitTrigger}
            </div>
          ) : null}
          {commitPortal}
        </>
      );
    },

    // Puck has no per-field validation-error prop to hook into (no field name/path is passed to
    // this override, only its display `label`), so an invalid field is matched by looking up
    // which field on the currently selected item (or the root, when nothing's selected) has a
    // `label` matching this one — the same label strings we already wrote into `fields`/
    // `root.fields`. This wraps every field, not just invalid ones, since Puck calls this same
    // component for all of them; only the offending ones get the red outline.
    //
    // Validity is (re)computed from the live selected item/root props on every render (same
    // pattern as headerActions' liveErrors above), rather than only on a Save/Publish attempt —
    // this matches custom fields like AliasField/ImagePickerField, which already flag themselves
    // live as the author types/picks, and clears the outline the moment the field is actually
    // fixed instead of leaving it stuck red until the next Save/Publish click.
    fieldLabel: ({ children, icon, label, el = "label", readOnly, className }) => {
      const selectedItem = useTypedPuck((state) => state.selectedItem);
      const rootProps = useTypedPuck(
        (state) => (state.appState.data.root as { props?: Record<string, unknown> } | undefined)?.props ?? {},
      );

      let isInvalid = false;

      if (selectedItem) {
        const component = (
          config.components as
            | Record<
                string,
                {
                  propsSchema?: (props: Record<string, unknown>) => z.ZodTypeAny;
                  fields?: Record<string, { label?: string }>;
                }
              >
            | undefined
        )?.[selectedItem.type as string];
        const result = component?.propsSchema?.(selectedItem.props as Record<string, unknown>).safeParse(selectedItem.props);
        if (result && !result.success) {
          isInvalid = result.error.issues.some((issue) => {
            const topLevelField = issue.path[0] !== undefined ? String(issue.path[0]) : "";
            const matchedLabel = component?.fields?.[topLevelField]?.label ?? topLevelField;
            return matchedLabel === label;
          });
        }
      } else if (rootPropsSchema) {
        const result = rootPropsSchema(rootProps).safeParse(rootProps);
        if (!result.success) {
          const rootFields = (config.root as { fields?: Record<string, { label?: string }> } | undefined)?.fields;
          isInvalid = result.error.issues.some((issue) => {
            const topLevelField = issue.path[0] !== undefined ? String(issue.path[0]) : "";
            const matchedLabel = rootFields?.[topLevelField]?.label ?? topLevelField;
            return matchedLabel === label;
          });
        }
      }

      const El = el as React.ElementType;

      return (
        <El className={className}>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            {icon}
            {label}
            {readOnly && (
              <span aria-hidden="true" title="Read only">
                🔒
              </span>
            )}
          </div>
          {/* Wraps only the field's own input, not the label text above — outlines the control
              itself, the same way AliasField/ImagePickerField color their own input/button red,
              rather than boxing the whole label+field group. An *inset* box-shadow (not outline)
              so it layers like a recolored border sitting inside the field's own edge, with any
              native focus ring (drawn via outline, outside the border box) landing outside it —
              matching how AliasField's own focus ring sits outside its red-bordered input. A
              zero-offset inset shadow would otherwise render fully underneath the field's own
              (opaque) background with nothing to peek out from behind, so this reserves a couple
              px of padding for it to actually be visible in — kept unconditional, not just while
              invalid, so the field doesn't resize by a few px each time validity flips. */}
          <div
            style={{ padding: "2px", borderRadius: "6px", boxShadow: isInvalid ? "inset 0 0 0 2px var(--color-error)" : undefined }}
          >
            {children}
          </div>
        </El>
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
  // Validates data.root.props (e.g. PagePuckEditor's title/alias) alongside the component tree —
  // see puck/page-root-schema.js for the pages case. Omit when the root has nothing that needs
  // enforcing beyond what Puck's own field UI already does.
  rootPropsSchema?: ((props: Record<string, unknown>) => z.ZodTypeAny) | undefined;
  // Gates the Commit option in the Publish dropdown — only a brand-new, not-yet-created
  // page/content item can be committed (state -1) instead of published live.
  isNew?: boolean;
  onCommit?: (data: Data) => void;
  headingFontLink?: string;
  bodyFontLink?: string;
  dictionary?: Dictionary;
}

export default function PuckEditor({ config, data, templateData, onPublish, onSave, rootPropsSchema, isNew, onCommit, headingFontLink, bodyFontLink, dictionary }: PuckEditorProps) {
  // Written to by createOverrides' headerActions (see below) with Puck's own dispatch, so it can
  // be reached imperatively from guardedOnPublish — which runs outside Puck's component tree, as
  // a plain PuckEditorProps.onPublish callback, and so can't call useTypedPuck itself.
  const dispatchRef = useRef<((action: PuckAction) => void) | null>(null);

  // Blocks Save/Publish client-side when a component's own propsSchema (see puck/index.js), or
  // rootPropsSchema, isn't satisfied — the same check every content-persisting API route runs
  // server-side (see puck/validate-content.js), so an author gets immediate feedback instead of a
  // redirect-with-alert round trip, but a bypass of this client check (or a direct POST) still
  // gets caught there.
  const guardedOnPublish = useCallback(
    (nextData: Data) => {
      const errors = validateContentTree(config, nextData, { rootPropsSchema });
      if (errors.length === 0) {
        onPublish(nextData);
        return;
      }
      // Deselect whatever's currently selected (if anything) and make sure both side panels are
      // open, so the fields panel falls back to showing the root's own fields (title/alias/etc.)
      // — the most likely place a blocked Publish is coming from, and otherwise easy to miss
      // behind whatever component was last selected.
      dispatchRef.current?.({
        type: "setUi",
        ui: { itemSelector: null, leftSideBarVisible: true, rightSideBarVisible: true },
      });
    },
    [config, onPublish, rootPropsSchema],
  );

  const guardedOnSave = useMemo(() => {
    if (!onSave) return undefined;
    return (nextData: Data) => {
      const errors = validateContentTree(config, nextData, { rootPropsSchema });
      if (errors.length === 0) onSave(nextData);
    };
  }, [config, onSave, rootPropsSchema]);

  // Same client-side guard as guardedOnPublish above, applied to the Commit action.
  const guardedOnCommit = useMemo(() => {
    if (!onCommit) return undefined;
    return (nextData: Data) => {
      const errors = validateContentTree(config, nextData, { rootPropsSchema });
      if (errors.length === 0) {
        onCommit(nextData);
        return;
      }
      dispatchRef.current?.({
        type: "setUi",
        ui: { itemSelector: null, leftSideBarVisible: true, rightSideBarVisible: true },
      });
    };
  }, [config, onCommit, rootPropsSchema]);

  const overrides = useMemo(
    () =>
      createOverrides(config, guardedOnSave, { headingFontLink, bodyFontLink }, dispatchRef, rootPropsSchema, {
        isNew,
        onCommit: guardedOnCommit,
      }),
    [config, guardedOnSave, headingFontLink, bodyFontLink, rootPropsSchema, isNew, guardedOnCommit],
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
      <Puck config={configCopy} data={data} onPublish={guardedOnPublish} overrides={overrides} {...(dictionary ? { dictionary } : {})} />
    </div>
  );
}
