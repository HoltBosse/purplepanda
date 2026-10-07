import { Button, createUsePuck, IconButton, Puck, useGetPuck } from "@puckeditor/core";
import "@puckeditor/core/puck.css";
import "../styles/puck-theme.css";
import type { Config, Data, Dictionary, Overrides, PuckApi, PuckContext } from "@puckeditor/core";
import { Render } from "@puckeditor/core";
import type React from "react";
import { cloneElement, createContext, isValidElement, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type * as z from "zod";
import { ensureStylesheet } from "../form/fields/font-picker-core.js";
import { ChevronDown, Moon, Save, Sun } from "../puck/icons.js";
import { sanitizeHtml } from "../puck/sanitize-html.js";
import { sanitizeRichtextData } from "../puck/sanitize-richtext.js";
import { getInjectedDisabledComponents, hideDisabledComponents } from "../puck/site-components.js";
import { type ContentValidationError, validateContentTree } from "../puck/validate-content.js";
import { type Mode, REPLACEMENT_DEFAULTS } from "../theme/index.js";
import { getInjectedTheme, setInjectedTheme, THEME_CHANNEL, type ThemeSummary } from "../theme/summary.js";
import { ensureTemplateSlot } from "./template-slot.js";

declare global {
  interface Window {
    // Set by AdminBareLayout's inline script the instant it renders the loading panda (see
    // `showLoadingPanda`) — read below so the on-screen-time floor is measured from when the
    // panda actually became visible, not from whenever this client:only bundle got around to
    // mounting.
    __puckLoadingPandaStartedAt?: number;
  }
}

const ROOT_SLOT_NAME = "default-zone";

// Rendered as real server-side HTML by AdminBareLayout (see its `showLoadingPanda` prop) so it's
// visible immediately — before this client:only bundle has even downloaded, let alone mounted.
// markEditorReady below removes it once the canvas is actually ready.
const LOADING_PANDA_ID = "puck-loading-panda";

// See markEditorReady below for why this floor exists.
const MIN_LOADING_PANDA_VISIBLE_MS = 500;

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

// How many animation frames to keep waiting for a just-selected component to show up in the
// canvas/outline DOM before scrolling anyway. The root zone is virtualized, so an offscreen
// component only gets rendered once Puck pins the newly selected index on its next render, and
// a freshly expanded outline branch likewise mounts a frame or two after the setUi dispatch.
const FOCUS_SCROLL_MAX_FRAMES = 60;

function scrollToComponentWhenRendered(id: string) {
  const escaped = CSS.escape(id);
  let frames = 0;
  const attempt = () => {
    const frame = document.querySelector<HTMLIFrameElement>("iframe#preview-frame");
    const canvas = frame?.contentDocument ?? document;
    const canvasEl = canvas.querySelector(`[data-puck-component="${escaped}"]`);
    // Only present when the author already has the outline open in the left panel — that panel
    // is deliberately left on whichever tab they chose, so this doesn't wait on it.
    const layerEl = document.querySelector(`[data-puck-layer-tree-id="${escaped}"]`);
    frames += 1;
    if (canvasEl || frames >= FOCUS_SCROLL_MAX_FRAMES) {
      canvasEl?.scrollIntoView({ behavior: "smooth", block: "center" });
      layerEl?.scrollIntoView({ block: "nearest" });
      return;
    }
    requestAnimationFrame(attempt);
  };
  requestAnimationFrame(attempt);
}

// Jumps the editor to whatever a validation error is about: selects the offending component (so
// the right panel shows its fields, with fieldLabel below outlining the bad ones) and scrolls the
// canvas — and the outline, if that's the left panel's open tab — to the component. Puck's own
// setUi reducer already expands every collapsed outline ancestor of a newly selected item, so
// that isn't handled here. Root/page-level errors (and any component that can't be located) instead
// deselect, so the fields panel falls back to the root's own fields (title/alias/etc.).
function focusValidationError(puck: PuckApi, error: ContentValidationError) {
  const selector = error.componentId === "root" ? undefined : puck.getSelectorForId(error.componentId);
  puck.dispatch({
    type: "setUi",
    ui: {
      itemSelector: selector ?? null,
      leftSideBarVisible: true,
      rightSideBarVisible: true,
    },
  });
  if (selector) scrollToComponentWhenRendered(error.componentId);
}

// Which of the theme's modes the canvas shows, shared by the header toggle and the iframe override
// (separate components Puck renders in different places). It only switches the canvas, never the
// admin UI around it.
function createCanvasModeStore() {
  let mode: Mode = "light";
  const listeners = new Set<() => void>();
  return {
    get: () => mode,
    set: (next: Mode) => {
      mode = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

type CanvasModeStore = ReturnType<typeof createCanvasModeStore>;

// The published site theme (injected by ThemeScript.astro), kept current when the theme screen
// saves in another tab.
function useSiteTheme(): ThemeSummary | undefined {
  const [theme, setTheme] = useState(getInjectedTheme);
  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const channel = new BroadcastChannel(THEME_CHANNEL);
    channel.onmessage = (event: MessageEvent<ThemeSummary>) => {
      setInjectedTheme(event.data);
      setTheme(event.data);
    };
    return () => channel.close();
  }, []);
  return theme;
}

// Puck's viewport bar (device sizes and zoom) has no override, so the canvas light/dark toggle is
// portalled into it, right after the device buttons, as an icon button wearing the bar's own
// classes. Puck's class names are hashed per build (e.g. `_ViewportControls-divider_v26yb_72`),
// hence the prefix match. Puck can rebuild the bar (entering and leaving full screen, a resize),
// so a MutationObserver puts the slot back whenever it goes missing.
const VIEWPORT_BAR = '[class*="_ViewportControls-actionsInner_"]';

type ViewportBarSlot = { node: HTMLElement; dividerClass: string; buttonClass: string; innerClass: string };

function useViewportBarSlot(): ViewportBarSlot | null {
  const [slot, setSlot] = useState<ViewportBarSlot | null>(null);
  useEffect(() => {
    let node: HTMLElement | null = null;
    const attach = () => {
      const bar = document.querySelector<HTMLElement>(VIEWPORT_BAR);
      if (!bar || (node && bar.contains(node))) return;
      const divider = bar.querySelector<HTMLElement>('[class*="_ViewportControls-divider_"]');
      const button = bar.querySelector<HTMLElement>('[class*="_ViewportButton_"]');
      const inner = bar.querySelector<HTMLElement>('[class*="_ViewportButton-inner_"]');
      node = document.createElement("span");
      node.style.display = "contents";
      // After the device buttons, ahead of the zoom controls (which start at the first divider).
      bar.insertBefore(node, divider);
      setSlot({
        node,
        dividerClass: divider?.className ?? "",
        // The device buttons' wrapper, minus whichever one happens to be the active size.
        buttonClass: [...(button?.classList ?? [])].filter((c) => !c.includes("--isActive")).join(" "),
        innerClass: inner?.className ?? "",
      });
    };
    attach();
    const observer = new MutationObserver(attach);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      node?.remove();
    };
  }, []);
  return slot;
}

function CanvasModeToggle({ store }: { store: CanvasModeStore }) {
  const mode = useSyncExternalStore(store.subscribe, store.get);
  const slot = useViewportBarSlot();
  if (!slot) return null;
  const next = mode === "light" ? "dark" : "light";
  const title = `Preview the page in ${next} mode`;
  return createPortal(
    <>
      <span className={slot.dividerClass} />
      <span className={slot.buttonClass} data-puck-canvas-mode={mode}>
        <IconButton type="button" title={title} onClick={() => store.set(next)}>
          <span className={slot.innerClass}>{mode === "light" ? <Moon size={16} /> : <Sun size={16} />}</span>
        </IconButton>
      </span>
    </>,
    slot.node,
  );
}

function createOverrides(
  config: Config,
  onSave: ((data: Data) => void) | undefined,
  canvasMode: CanvasModeStore,
  // Populated from inside headerActions below (the only override here rendered unconditionally,
  // as soon as Puck mounts) so guardedOnPublish/guardedOnSave/guardedOnCommit — defined outside
  // Puck's tree, in plain PuckEditor component scope — can still reach into it imperatively once
  // an attempt is blocked, to jump to the first offending component (see focusValidationError).
  // useGetPuck's getter always reads the latest store state, so caching a closure over it is safe.
  focusErrorRef: { current: ((errors: ContentValidationError[]) => void) | null },
  rootPropsSchema: ((props: Record<string, unknown>) => z.ZodTypeAny) | undefined,
  // Commit is an alternate publish action offered only while authoring a brand-new page/content
  // item (see PuckEditor's isNew prop) — it POSTs to the same endpoint as Publish but persists the
  // row as state -1 instead of going live. Undefined onCommit (editing an existing item) hides it.
  commit: { isNew: boolean | undefined; onCommit: ((data: Data) => void) | undefined } | undefined,
  // Called once Puck's AutoFrame hands back a live iframe `document` — the earliest reliable signal
  // that the actual editor canvas (not just the surrounding chrome) is ready to interact with.
  onEditorReady: () => void,
): Partial<Overrides<Config>> {
  return {
    headerActions: ({ children }) => {
      const appStateData = useTypedPuck((state) => state.appState.data);
      const getPuck = useGetPuck();
      focusErrorRef.current = (errors) => {
        if (errors[0]) focusValidationError(getPuck(), errors[0]);
      };

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
      const liveErrors = useMemo(() => validateContentTree(config, appStateData, { rootPropsSchema, disabledComponents: getInjectedDisabledComponents() }), [appStateData]);

      // Each click jumps to the next offending component after the currently selected one
      // (wrapping around), so repeated clicks walk every error in tree order. With nothing selected
      // the root fields are already showing, so "root" counts as the current position there.
      const focusNextError = () => {
        const componentIds = [...new Set(liveErrors.map((error) => error.componentId))];
        const puck = getPuck();
        const currentId = (puck.selectedItem?.props as { id?: string } | undefined)?.id ?? "root";
        const nextId = componentIds[(componentIds.indexOf(currentId) + 1) % componentIds.length];
        const nextError = liveErrors.find((error) => error.componentId === nextId);
        if (nextError) focusValidationError(puck, nextError);
      };

      // The full per-field messages are in the title tooltip since there's no toast/panel system
      // to host a longer list inline in the header.
      const validationBadge =
        liveErrors.length > 0 ? (
          <span role="alert" data-puck-validation-errors style={{ alignSelf: "center", marginRight: "0.5rem" }}>
            <button
              type="button"
              onClick={focusNextError}
              title={`${liveErrors.map((error) => `${error.componentType} — ${error.field}: ${error.message}`).join("\n")}\n\nClick to jump to the next one.`}
              style={{
                fontSize: "0.8rem",
                color: "var(--color-error)",
                textDecoration: "underline",
                textUnderlineOffset: "2px",
                cursor: "pointer",
              }}
            >
              {liveErrors.length} field{liveErrors.length === 1 ? "" : "s"} need attention
            </button>
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
            <CanvasModeToggle store={canvasMode} />
            {saveButton}
            {publishButton}
            {commitPortal}
          </>
        );
      }

      return (
        <>
          {validationBadge}
          <CanvasModeToggle store={canvasMode} />
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
      // `document` itself becomes available the instant AutoFrame's tiny static srcDoc shell
      // loads — essentially immediately, well before Puck has portaled the actual canvas content
      // into #frame-root or (via AutoFrame's CopyHostStyles) finished mirroring this page's
      // stylesheets into the iframe. Firing onEditorReady() right here swaps the loading panda
      // for a still-empty, unstyled canvas that then pops into its real appearance a beat later —
      // this instead polls until real content has landed and every mirrored stylesheet has
      // resolved, so the swap reveals the actual finished editor.
      useEffect(() => {
        if (!document) return;

        let rafId: number | undefined;
        let settled = false;

        const isCanvasReady = () => {
          const entry = document.getElementById("frame-root");
          if (!entry || entry.children.length === 0) return false;
          return Array.from(document.querySelectorAll('link[rel="stylesheet"]')).every(
            (link) => (link as HTMLLinkElement).sheet !== null,
          );
        };

        const finish = () => {
          if (settled) return;
          settled = true;
          if (rafId !== undefined) cancelAnimationFrame(rafId);
          window.clearTimeout(fallbackId);
          onEditorReady();
        };

        const poll = () => {
          if (isCanvasReady()) {
            finish();
            return;
          }
          rafId = requestAnimationFrame(poll);
        };

        // A stylesheet that's slow, blocked, or fails outright (offline dev, a flaky CDN)
        // shouldn't strand the loading screen up forever — fall back to swapping in the editor
        // as-is.
        const fallbackId = window.setTimeout(finish, 4000);
        poll();

        return () => {
          settled = true;
          if (rafId !== undefined) cancelAnimationFrame(rafId);
          window.clearTimeout(fallbackId);
        };
      }, [document]);

      const theme = useSiteTheme();
      const mode = useSyncExternalStore(canvasMode.subscribe, canvasMode.get);

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

        // The page itself takes the default scheme, as the published <body> does.
        document.body.setAttribute("data-scheme", REPLACEMENT_DEFAULTS.scheme);

        return () => themeObserver.disconnect();
      }, [document]);

      // The mode is pinned rather than left to the author's system setting, so the header toggle
      // decides what the canvas shows. AutoFrame only ever adds attributes, so this one stays put.
      useEffect(() => {
        document?.documentElement.setAttribute("data-pp-mode", mode);
      }, [document, mode]);

      // The site theme's CSS and font stylesheets, the same ones published pages load.
      useEffect(() => {
        if (!document || !theme) return;
        let style = document.getElementById("purplepanda-theme") as HTMLStyleElement | null;
        if (!style) {
          style = document.createElement("style");
          style.id = "purplepanda-theme";
          document.head.appendChild(style);
        }
        style.textContent = theme.css;

        for (const href of theme.fontLinks) ensureStylesheet(href, document);
      }, [document, theme]);

      return <>{children}</>;
    },
  };
}

export interface PuckEditorProps {
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
  dictionary?: Dictionary;
}

export default function PuckEditor({ config, data, templateData, onPublish, onSave, rootPropsSchema, isNew, onCommit, dictionary }: PuckEditorProps) {
  // Written to by createOverrides' headerActions (see below), so it can be reached imperatively
  // from guardedOnPublish — which runs outside Puck's component tree, as a plain
  // PuckEditorProps.onPublish callback, and so can't call useTypedPuck itself.
  const focusErrorRef = useRef<((errors: ContentValidationError[]) => void) | null>(null);

  // AdminBareLayout stamps this the instant it renders the loading panda — i.e. essentially at
  // navigation start, well before this component's own (heavy, client:only) bundle has even
  // downloaded. Falling back to this component's own mount time covers the case where the page
  // didn't opt into `showLoadingPanda` (e.g. these editors' own tests), so there's still a sane
  // floor to measure from.
  const mountedAtRef = useRef(window.__puckLoadingPandaStartedAt ?? Date.now());
  const readyTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(readyTimeoutRef.current), []);

  // On a fast connection (or in local dev) the canvas can go from mounted to actually ready in
  // well under a second — fast enough that the loading panda would otherwise flash on and off
  // before it's even registered. Enforcing a minimum on-screen time keeps it a legible loading
  // step instead of a flicker.
  const hideLoadingPanda = useCallback(() => {
    const panda = document.getElementById(LOADING_PANDA_ID);
    if (!panda) return;
    panda.style.transition = "opacity 0.3s ease-out";
    panda.style.opacity = "0";
    panda.style.pointerEvents = "none";
    window.setTimeout(() => panda.remove(), 300);
  }, []);
  const markEditorReady = useCallback(() => {
    const remainingMs = MIN_LOADING_PANDA_VISIBLE_MS - (Date.now() - mountedAtRef.current);
    if (remainingMs <= 0) {
      hideLoadingPanda();
      return;
    }
    readyTimeoutRef.current = setTimeout(hideLoadingPanda, remainingMs);
  }, [hideLoadingPanda]);

  // Blocks Save/Publish client-side when a component's own propsSchema (see puck/index.js), or
  // rootPropsSchema, isn't satisfied — the same check every content-persisting API route runs
  // server-side (see puck/validate-content.js), so an author gets immediate feedback instead of a
  // redirect-with-alert round trip, but a bypass of this client check (or a direct POST) still
  // gets caught there.
  const guardedOnPublish = useCallback(
    (nextData: Data) => {
      const errors = validateContentTree(config, nextData, { rootPropsSchema, disabledComponents: getInjectedDisabledComponents() });
      if (errors.length === 0) {
        onPublish(nextData);
        return;
      }
      focusErrorRef.current?.(errors);
    },
    [config, onPublish, rootPropsSchema],
  );

  const guardedOnSave = useMemo(() => {
    if (!onSave) return undefined;
    return (nextData: Data) => {
      const errors = validateContentTree(config, nextData, { rootPropsSchema, disabledComponents: getInjectedDisabledComponents() });
      if (errors.length === 0) {
        onSave(nextData);
        return;
      }
      focusErrorRef.current?.(errors);
    };
  }, [config, onSave, rootPropsSchema]);

  // Same client-side guard as guardedOnPublish above, applied to the Commit action.
  const guardedOnCommit = useMemo(() => {
    if (!onCommit) return undefined;
    return (nextData: Data) => {
      const errors = validateContentTree(config, nextData, { rootPropsSchema, disabledComponents: getInjectedDisabledComponents() });
      if (errors.length === 0) {
        onCommit(nextData);
        return;
      }
      focusErrorRef.current?.(errors);
    };
  }, [config, onCommit, rootPropsSchema]);

  const canvasMode = useMemo(createCanvasModeStore, []);

  const overrides = useMemo(
    () =>
      createOverrides(
        config,
        guardedOnSave,
        canvasMode,
        focusErrorRef,
        rootPropsSchema,
        { isNew, onCommit: guardedOnCommit },
        markEditorReady,
      ),
    [config, guardedOnSave, canvasMode, rootPropsSchema, isNew, guardedOnCommit, markEditorReady],
  );

  // Puck's richtext field shows stored HTML raw until its tiptap editor chunk loads, so the
  // content being edited is sanitized too — see sanitize-richtext.ts.
  const safeData = useMemo(() => sanitizeRichtextData(config, data, sanitizeHtml), [config, data]);

  // Memoized because it feeds the root render below: a fresh object each render would rebuild the
  // root component's identity and remount the whole canvas on every keystroke.
  const normalizedTemplateData = useMemo(
    // The template is drawn with Puck's read-only <Render>, whose richtext fallback injects stored
    // HTML raw — see sanitize-richtext.ts.
    () => (templateData ? sanitizeRichtextData(config, ensureTemplateSlot(templateData), sanitizeHtml) : undefined),
    [templateData, config],
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
      // Components this site has turned off stay registered, so content already using them still
      // draws, but drop out of the palette (see puck/site-components.ts).
      ...hideDisabledComponents(config, getInjectedDisabledComponents()),
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
      <Puck config={configCopy} data={safeData} onPublish={guardedOnPublish} overrides={overrides} {...(dictionary ? { dictionary } : {})} />
    </div>
  );
}
