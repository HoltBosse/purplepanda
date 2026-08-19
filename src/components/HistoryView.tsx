import type { Data } from "@puckeditor/core";
import GitBranchPlus from "lucide-react/dist/esm/icons/git-branch-plus.mjs";
import Monitor from "lucide-react/dist/esm/icons/monitor.mjs";
import Smartphone from "lucide-react/dist/esm/icons/smartphone.mjs";
import Tablet from "lucide-react/dist/esm/icons/tablet.mjs";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  computeLayout,
  type DagNodeData,

  type LayoutNode,
  laneY,
  MAIN_Y,
  PAD_X,
} from "./history-layout.js";
import PageRenderer from "./PageRenderer.js";

// ─── Layout constants ─────────────────────────────────────────────────────────

const NODE_R = 7;
const MIN_COL_W = 56;
const FRAME_HEIGHT = 600;

// ─── Viewport presets ──────────────────────────────────────────────────────────

// Simulated device widths for the preview panes, matching Puck's own editor
// viewport presets (see @puckeditor/core's default-viewports) so switching
// between the Puck editor and this read-only history view feels consistent.
type ViewportKey = "mobile" | "tablet" | "desktop";

const VIEWPORTS: Record<ViewportKey, { width: number; icon: typeof Smartphone; label: string }> = {
  mobile: { width: 360, icon: Smartphone, label: "Mobile" },
  tablet: { width: 768, icon: Tablet, label: "Tablet" },
  desktop: { width: 1280, icon: Monitor, label: "Desktop" },
};

// ─── Colors ────────────────────────────────────────────────────────────────────

// Publish (blue) / draft (violet) palette, shared by the SVG marks and the HTML
// lane-label pills so the two never drift. `line`/`label` are the solid mark
// colors; `tintBg`/`tintBorder` are the translucent pill fill and border.
const PUBLISH = {
  line: "#3b82f6",
  label: "#60a5fa",
  tintBg: "rgba(59,130,246,0.1)",
  tintBorder: "rgba(59,130,246,0.3)",
} as const;
const DRAFT = {
  line: "#8b5cf6",
  label: "#a78bfa",
  tintBg: "rgba(139,92,246,0.1)",
  tintBorder: "rgba(139,92,246,0.3)",
} as const;

// ─── Types ───────────────────────────────────────────────────────────────────

export type { DagNodeData, LayoutNode } from "./history-layout.js";

type EdgeKind = "main" | "branch-off" | "branch-line" | "merge-back";

const laneKeyOf = (node: LayoutNode) =>
  node.nodeType === "publish" ? "publish" : (node.name ?? "draft");

interface Edge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: EdgeKind;
}

export interface HistoryViewProps {
  entityType: "page" | "template" | "content" | "form" | "prefab";
  entityId: string;
  currentContent: Record<string, unknown>;
  nodes: DagNodeData[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Server and client can be in different timezones, which would make
// locale-formatted dates mismatch during hydration. `timeZone` lets callers
// pin a deterministic zone (e.g. "UTC") for the SSR / first-client-render
// pass, then omit it to switch to the viewer's local time post-hydration.
function formatDate(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  });
}

function shortDate(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(timeZone ? { timeZone } : {}),
  });
}

// False during SSR and the first client render (so hydration matches),
// true from the next render onward.
function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}

// ─── Layout computation ───────────────────────────────────────────────────────

// ─── PreviewFrame ────────────────────────────────────────────────────────────

// Renders children inside an iframe (via portal) so the preview picks up the
// site's own stylesheets and behaves like the actual page, rather than
// inheriting styles/theme from the admin shell it's embedded in.
//
// `viewportWidth` simulates a device width the way Puck's own editor
// viewport control does: the iframe is laid out at that fixed width so the
// page reflows as it would on that device, then CSS-scaled (transform:
// scale, width-driven only) so the simulated device always fills whatever
// horizontal space is actually available. The preview box's height is
// fixed, so a page taller than it is cropped at the bottom rather than
// shrinking the whole preview to fit — the same trade a real device makes.
function PreviewFrame({
  children,
  viewportWidth,
}: {
  children: React.ReactNode;
  viewportWidth: number;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setContainerWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const setup = () => {
      const doc = iframe.contentDocument;
      if (!doc) return;

      doc.documentElement.setAttribute("data-theme", "false");
      doc.body.style.margin = "0";
      // This is a read-only comparison, not a live page — clicking a link, submitting a form, or
      // opening a Select's dropdown here would be surprising (and, for a form, would fire a real
      // submission) rather than doing anything useful for a diff view.
      doc.body.style.pointerEvents = "none";

      document
        .querySelectorAll('link[rel="stylesheet"], style')
        .forEach((node) => { doc.head.appendChild(node.cloneNode(true)); });

      setMountNode(doc.body);
    };

    if (iframe.contentDocument?.readyState === "complete") {
      setup();
    } else {
      iframe.addEventListener("load", setup);
    }

    return () => iframe.removeEventListener("load", setup);
  }, []);

  // Only scale down, never up — a preset narrower than the available space
  // renders at its natural size.
  const scale =
    containerWidth > 0 ? Math.min(1, containerWidth / viewportWidth) : 1;

  return (
    <div
      ref={outerRef}
      style={{
        width: "100%",
        // Fixed regardless of preset/scale, so switching between
        // mobile/tablet/desktop doesn't reflow the page around the panel.
        height: "37.5rem",
        overflow: "hidden",
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: viewportWidth,
          // Inflated by 1/scale so that, once the transform below shrinks
          // it back down, the visible crop is always exactly the fixed
          // preview height — content beyond that is clipped by the
          // overflow:hidden above, rather than shrinking the whole preview.
          height: FRAME_HEIGHT / scale,
          flex: "none",
          transform: `scale(${scale})`,
          transformOrigin: "top center",
        }}
      >
        <iframe
          ref={iframeRef}
          title="Page preview"
          style={{ width: "100%", height: "100%", border: "none", display: "block" }}
        />
        {mountNode ? createPortal(children, mountNode) : null}
      </div>
    </div>
  );
}

// ─── CreateDraftDialog ───────────────────────────────────────────────────────

// Submits a real POST (rather than fetch) so the server's redirect to
// /admin/{type}/drafts/edit/{id} — or, on failure, its session-flashed error
// alert — is followed by the browser exactly as it is from the pages/content
// list views. Mirrors the hidden-form pattern in PagePuckEditor.tsx.
function submitCreateDraft(
  entityType: string,
  entityId: string,
  name: string,
  sourceNodeId: string | null
) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = "/admin/drafts/create";
  form.style.display = "none";

  const fields: Record<string, string> = { entityType, entityId, name };
  if (sourceNodeId !== null) fields.sourceNodeId = sourceNodeId;

  for (const [key, value] of Object.entries(fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = key;
    input.value = value;
    form.appendChild(input);
  }

  document.body.appendChild(form);
  form.submit();
}

function CreateDraftDialog({
  dialogRef,
  entityType,
  entityId,
  sourceNode,
}: {
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  entityType: string;
  entityId: string;
  sourceNode: DagNodeData | null;
}) {
  const [name, setName] = useState("");
  const hydrated = useHydrated();

  const close = () => dialogRef.current?.close();

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!name.trim()) return;
    submitCreateDraft(entityType, entityId, name.trim(), sourceNode?.id ?? null);
  };

  const sourceKindLabel = sourceNode
    ? sourceNode.nodeType === "draft"
      ? `Draft · ${sourceNode.name ?? ""}`
      : "Publish"
    : null;

  return (
    <dialog ref={dialogRef} className="modal">
      <div className="modal-box">
        <h3 className="font-bold text-lg mb-4">Create Draft</h3>
        <form onSubmit={handleSubmit}>
          {sourceNode && (
            <p className="text-xs text-base-content/50 mb-4">
              Branching from:{" "}
              <span className="font-medium text-base-content/70">
                {sourceKindLabel} ·{" "}
                {hydrated ? (
                  formatDate(sourceNode.createdAt)
                ) : (
                  <span className="inline-block h-3 w-24 align-middle rounded bg-base-300 animate-pulse" />
                )}
              </span>
            </p>
          )}
          <div className="form-control">
            <label className="label" htmlFor="create-draft-from-name">
              <span className="label-text">Draft Name</span>
            </label>
            <input
              type="text"
              id="create-draft-from-name"
              className="input input-bordered w-full"
              placeholder="e.g. Homepage redesign"
              required
              autoComplete="off"
              autoFocus
              maxLength={20}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="modal-action mt-6">
            <button type="button" className="btn btn-ghost" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Create Draft
            </button>
          </div>
        </form>
      </div>
      <button
        type="button"
        className="modal-backdrop"
        onClick={close}
        aria-label="Close"
      />
    </dialog>
  );
}

// ─── RenderPanel ─────────────────────────────────────────────────────────────

// Memoized so that changing the *compared* selection re-renders only that
// panel — the unchanged "Current" panel (stable props, no `date`) skips its
// Puck <Render> pass instead of re-reconciling on every selection commit.
const RenderPanel = React.memo(function RenderPanel({
  label,
  badge,
  badgeClass,
  date,
  content,
  viewportWidth,
}: {
  label: string;
  badge?: string;
  badgeClass?: string;
  date?: React.ReactNode;
  content: Record<string, unknown>;
  viewportWidth: number;
}) {
  return (
    <div className="bg-base-100 border border-base-300 rounded-xl overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-base-300 flex items-center gap-2 shrink-0">
        <span className="text-xs font-semibold text-base-content/50 uppercase tracking-wide">
          {label}
        </span>
        {badge !== undefined && (
          <span className={`badge badge-sm ${badgeClass ?? ""}`}>{badge}</span>
        )}
        {date !== undefined && (
          <span className="text-xs text-base-content/40 ml-auto">{date}</span>
        )}
      </div>
      <PreviewFrame viewportWidth={viewportWidth}>
        <PageRenderer pageData={content as unknown as Data} />
      </PreviewFrame>
    </div>
  );
});

// ─── ViewportControls ────────────────────────────────────────────────────────

// Mobile/tablet/desktop preset switcher for the preview panes, styled after
// Puck's own editor viewport control. Shared between the two RenderPanels
// (rather than one per panel) so "Current" and the compared revision are
// always laid out at the same simulated width and stay comparable.
function ViewportControls({
  viewport,
  onChange,
}: {
  viewport: ViewportKey;
  onChange: (viewport: ViewportKey) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-1">
      {(Object.keys(VIEWPORTS) as ViewportKey[]).map((key) => {
        const { icon: Icon, label } = VIEWPORTS[key];
        const active = key === viewport;
        return (
          <button
            key={key}
            type="button"
            className={`btn btn-xs btn-square btn-ghost ${active ? "text-primary" : ""}`}
            aria-label={label}
            aria-pressed={active}
            title={label}
            onClick={() => onChange(key)}
          >
            <Icon size={14} />
          </button>
        );
      })}
    </div>
  );
}

// ─── LaneLabel ───────────────────────────────────────────────────────────────

// A pill pinned to the left edge of the timeline viewport, marking a lane
// (publish or a named draft branch). Fades in/out via `visible`.
function LaneLabel({
  top,
  color,
  visible,
  children,
}: {
  top: number;
  color: typeof PUBLISH | typeof DRAFT;
  visible: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="absolute flex items-center justify-center rounded-full transition-opacity duration-300 ease-out"
      style={{
        left: 4,
        top: top - 11,
        width: 52,
        height: 22,
        fontSize: 9,
        fontFamily: "ui-monospace,monospace",
        fontWeight: 500,
        color: color.label,
        background: color.tintBg,
        border: `0.5px solid ${color.tintBorder}`,
        opacity: visible ? 1 : 0,
      }}
    >
      {children}
    </div>
  );
}

// ─── TimelineMarks ───────────────────────────────────────────────────────────

// The static graph geometry — lane guides, edges, and nodes. Kept in a memoized
// component, separate from the playhead and lane labels, so the per-frame state
// that changes during a drag (cursor position, scroll-driven label fades) only
// re-renders the moving overlay, not all N nodes and edges. This subtree
// re-renders only when the layout or the selected node actually changes.
const TimelineMarks = React.memo(function TimelineMarks({
  layout,
  edges,
  branchNames,
  svgW,
  selectedId,
  dateTimeZone,
  onSelectNode,
}: {
  layout: LayoutNode[];
  edges: Edge[];
  branchNames: string[];
  svgW: number;
  selectedId: string | null;
  dateTimeZone: string | undefined;
  onSelectNode: (id: string, x: number) => void;
}) {
  return (
    <>
      {/* Publish lane */}
      <line
        x1={PAD_X - 12} y1={MAIN_Y} x2={svgW - 16} y2={MAIN_Y}
        stroke={PUBLISH.line} strokeWidth={0.5} strokeOpacity={0.18} strokeDasharray="4 5"
      />

      {/* Per-branch draft lanes */}
      {branchNames.map((name, i) => (
        <line key={name}
          x1={PAD_X - 12} y1={laneY(i)} x2={svgW - 16} y2={laneY(i)}
          stroke={DRAFT.line} strokeWidth={0.5} strokeOpacity={0.18} strokeDasharray="4 5"
        />
      ))}

      {/* Edges */}
      {edges.map((edge) => {
        // Edges have no id — the rendered geometry itself is a stable, unique identity
        // (two edges sharing kind + endpoints would be visually indistinguishable anyway).
        const key = `${edge.kind}-${edge.x1}-${edge.y1}-${edge.x2}-${edge.y2}`;
        if (edge.kind === "main") {
          return (
            <line key={key}
              x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2}
              stroke={PUBLISH.line} strokeWidth={2} strokeLinecap="round" opacity={0.6}
            />
          );
        }
        if (edge.kind === "branch-line") {
          return (
            <line key={key}
              x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2}
              stroke={DRAFT.line} strokeWidth={1.5} strokeLinecap="round"
              strokeDasharray="4 3" opacity={0.6}
            />
          );
        }
        const sdx = edge.x2 - edge.x1;
        const cp = Math.abs(sdx) * 0.55;
        const d = `M ${edge.x1} ${edge.y1} C ${edge.x1 + (sdx > 0 ? cp : -cp)} ${edge.y1} ${edge.x2 - (sdx > 0 ? cp : -cp)} ${edge.y2} ${edge.x2} ${edge.y2}`;
        return (
          <path key={key} d={d} stroke={DRAFT.line}
            strokeWidth={1.5}
            strokeDasharray={edge.kind === "branch-off" ? "4 3" : undefined}
            fill="none" strokeLinecap="round" opacity={0.6}
          />
        );
      })}

      {/* Nodes */}
      {layout.map((node) => {
        const isSelected = node.id === selectedId;
        const isPublish = node.nodeType === "publish";
        const fill = isPublish ? PUBLISH.line : DRAFT.line;
        const r = isSelected ? NODE_R + 3 : NODE_R;
        const label = shortDate(node.createdAt, dateTimeZone);
        const labelY = isPublish ? node.y - NODE_R - 10 : node.y + NODE_R + 13;

        return (
          // biome-ignore lint/a11y/useSemanticElements: this is an SVG <g> wrapping SVG shape children (<circle>/<text>) — a real <button> isn't a valid SVG container here
          <g key={node.id}
            role="button"
            tabIndex={0}
            aria-label={`Select revision from ${label}`}
            aria-pressed={isSelected}
            onClick={() => onSelectNode(node.id, node.x)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectNode(node.id, node.x);
              }
            }}
            style={{ cursor: "pointer" }}
          >
            {isSelected && (
              <circle cx={node.x} cy={node.y} r={r + 4}
                fill="none" stroke={fill} strokeWidth={1.5} opacity={0.3} />
            )}
            <circle cx={node.x} cy={node.y} r={r}
              fill={fill}
              stroke={isSelected ? "#fff" : "transparent"}
              strokeWidth={2}
              opacity={isSelected ? 1 : 0.65}
            />
            <text x={node.x} y={labelY}
              textAnchor="middle" fontSize={9}
              fill={isSelected ? "#e2e8f0" : "#64748b"}
              fontFamily="ui-monospace, monospace"
            >
              {label}
            </text>
          </g>
        );
      })}
    </>
  );
});

// ─── TimelineGraph ───────────────────────────────────────────────────────────

// Owns everything about the scroll position and drag gesture. This is
// isolated from HistoryView specifically so that its high-frequency state
// (scroll position while dragging can update on nearly every animation
// frame) never re-renders the live preview panes below the timeline — those
// should only re-render when the *selected node* actually changes.
function TimelineGraph({
  entityType,
  nodes,
  selectedId,
  onSelect,
}: {
  entityType: string;
  nodes: DagNodeData[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const isDragging = useRef(false);
  const hydrated = useHydrated();
  const dateTimeZone = hydrated ? undefined : "UTC";

  const [cursorX, setCursorX] = useState<number | null>(null);
  const [measured, setMeasured] = useState(false);
  const [scrollLeft, setScrollLeft] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerWidth(entry.contentRect.width);
        setMeasured(true);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Narrow containers (mobile-ish widths) show fewer nodes at once so they
  // stay legible; wider containers show more before scrolling kicks in.
  const visibleNodeCount = containerWidth > 0 && containerWidth < 640 ? 4 : 12;
  const colW =
    containerWidth > 0
      ? Math.max(
          MIN_COL_W,
          (containerWidth - PAD_X * 2) / Math.max(1, visibleNodeCount - 1)
        )
      : MIN_COL_W;

  const svgW = Math.max(
    containerWidth,
    PAD_X * 2 + Math.max(0, nodes.length - 1) * colW
  );

  const { layout, branchNames, svgHeight } = useMemo(
    () => computeLayout(nodes, svgW),
    [nodes, svgW]
  );

  useEffect(() => {
    if (selectedId === null) return;
    const node = layout.find((n) => n.id === selectedId);
    if (node) setCursorX(node.x);
  }, [layout, selectedId]);

  // On first load the default selection is the most recent node (the
  // rightmost one) — scroll it into view once so the graph doesn't open
  // scrolled to the far left with the playhead off-screen.
  const didInitialScroll = useRef(false);
  useEffect(() => {
    if (didInitialScroll.current) return;
    if (!measured || layout.length === 0) return;
    const container = containerRef.current;
    if (!container) return;
    didInitialScroll.current = true;
    container.scrollLeft = container.scrollWidth - container.clientWidth;
  }, [measured, layout]);

  const findNearest = useCallback(
    (x: number): LayoutNode | null => {
      if (layout.length === 0) return null;
      return layout.reduce<LayoutNode | null>((best, node) => {
        if (best === null) return node;
        return Math.abs(node.x - x) < Math.abs(best.x - x) ? node : best;
      }, null);
    },
    [layout]
  );

  // Committing a selection swaps the preview panel's content, which reassigns
  // the preview <img> srcs and kicks off image loads. We commit on a
  // leading-edge throttle: the very first move commits immediately (so
  // selecting feels instant), then at most once per interval while the drag
  // keeps moving, plus a trailing commit when it settles. This keeps the
  // preview live during a drag without reassigning the src every frame —
  // reassigning faster than images can download would abort in-flight
  // requests ("canceled") so none ever complete or populate the browser cache.
  // The playhead (cursorX) still tracks the cursor immediately on every move.
  const SELECT_THROTTLE_MS = 80;
  const lastCommitAt = useRef(0);
  const pendingId = useRef<string | null>(null);
  const pendingTimer = useRef<number | null>(null);

  const flushSelect = useCallback(() => {
    if (pendingTimer.current !== null) {
      window.clearTimeout(pendingTimer.current);
      pendingTimer.current = null;
    }
    if (pendingId.current !== null) {
      lastCommitAt.current = performance.now();
      onSelect(pendingId.current);
      pendingId.current = null;
    }
  }, [onSelect]);

  const scheduleSelect = useCallback(
    (id: string) => {
      pendingId.current = id;
      const elapsed = performance.now() - lastCommitAt.current;
      if (elapsed >= SELECT_THROTTLE_MS) {
        flushSelect(); // leading edge — commit right away
      } else if (pendingTimer.current === null) {
        pendingTimer.current = window.setTimeout(() => {
          pendingTimer.current = null;
          flushSelect(); // trailing edge — commit once the interval elapses
        }, SELECT_THROTTLE_MS - elapsed);
      }
    },
    [flushSelect]
  );

  useEffect(() => {
    return () => {
      if (pendingTimer.current !== null) window.clearTimeout(pendingTimer.current);
    };
  }, []);

  const applyX = useCallback(
    (svgX: number, immediate: boolean) => {
      const nearest = findNearest(svgX);
      if (nearest) {
        setCursorX(nearest.x);
        if (immediate) {
          pendingId.current = nearest.id;
          flushSelect();
        } else {
          scheduleSelect(nearest.id);
        }
      }
    },
    [findNearest, flushSelect, scheduleSelect]
  );

  // Clicking a node commits it immediately and snaps the playhead to it.
  // Stable identity keeps TimelineMarks' memo from re-rendering on cursor moves.
  const onSelectNode = useCallback(
    (id: string, x: number) => {
      onSelect(id);
      setCursorX(x);
    },
    [onSelect]
  );

  const svgRef = useRef<SVGSVGElement>(null);
  const lastClientX = useRef<number | null>(null);
  const autoScrollFrame = useRef<number | null>(null);

  const updateFromClientX = useCallback(
    (clientX: number, immediate = false) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      applyX(clientX - rect.left, immediate);
    },
    [applyX]
  );

  const stopAutoScroll = useCallback(() => {
    if (autoScrollFrame.current !== null) {
      cancelAnimationFrame(autoScrollFrame.current);
      autoScrollFrame.current = null;
    }
  }, []);

  // While dragging, sliding the cursor near either edge of the visible
  // viewport pans the graph in that direction (clamped to its ends) so
  // long histories stay scrubbable without leaving the drag gesture.
  const tickAutoScroll = useCallback(() => {
    const container = containerRef.current;
    if (!container || !isDragging.current || lastClientX.current === null) {
      autoScrollFrame.current = null;
      return;
    }

    const rect = container.getBoundingClientRect();
    const x = lastClientX.current;
    const EDGE = 56;
    const MAX_SPEED = 18;
    let dx = 0;
    if (x < rect.left + EDGE) {
      dx = -MAX_SPEED * Math.min(1, (rect.left + EDGE - x) / EDGE);
    } else if (x > rect.right - EDGE) {
      dx = MAX_SPEED * Math.min(1, (x - (rect.right - EDGE)) / EDGE);
    }

    if (dx !== 0) {
      const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
      const next = Math.min(maxScroll, Math.max(0, container.scrollLeft + dx));
      if (next !== container.scrollLeft) {
        container.scrollLeft = next;
        updateFromClientX(x);
      }
    }

    autoScrollFrame.current = requestAnimationFrame(tickAutoScroll);
  }, [updateFromClientX]);

  // One code path for mouse, touch, and pen. `setPointerCapture` routes all
  // subsequent move/up events for this pointer to the SVG even when the cursor
  // leaves its bounds, so the drag survives straying outside (no window-level
  // listeners needed) and ends reliably on release. `touchAction: none` on the
  // SVG keeps touch from being stolen by the browser's own scroll/pan gesture.
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      isDragging.current = true;
      lastClientX.current = e.clientX;
      updateFromClientX(e.clientX, true);
      if (autoScrollFrame.current === null) {
        autoScrollFrame.current = requestAnimationFrame(tickAutoScroll);
      }
    },
    [updateFromClientX, tickAutoScroll]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!isDragging.current) return;
      lastClientX.current = e.clientX;
      updateFromClientX(e.clientX);
    },
    [updateFromClientX]
  );

  const stopDrag = useCallback(() => {
    isDragging.current = false;
    lastClientX.current = null;
    stopAutoScroll();
    flushSelect();
  }, [stopAutoScroll, flushSelect]);

  useEffect(() => stopAutoScroll, [stopAutoScroll]);

  const layoutById = useMemo(
    () => new Map(layout.map((n) => [n.id, n])),
    [layout]
  );

  const edges = useMemo<Edge[]>(() => {
    return layout.flatMap((node) => {
      if (node.parentId === null) return [];
      const parent = layoutById.get(node.parentId);
      if (!parent) return [];

      let kind: EdgeKind;
      if (parent.nodeType === "publish" && node.nodeType === "publish") {
        kind = "main";
      } else if (parent.nodeType === "publish" && node.nodeType === "draft") {
        kind = "branch-off";
      } else if (parent.nodeType === "draft" && node.nodeType === "draft") {
        kind = "branch-line";
      } else {
        kind = "merge-back";
      }

      return [{ x1: parent.x, y1: parent.y, x2: node.x, y2: node.y, kind }];
    });
  }, [layout, layoutById]);

  // Drives the fade in/out of lane labels: a lane's label only shows while
  // at least one of its nodes is scrolled into the visible viewport.
  const laneVisible = useMemo(() => {
    const viewStart = scrollLeft;
    const viewEnd = scrollLeft + containerWidth;
    const visible = new Set<string>();
    for (const node of layout) {
      if (node.x + NODE_R >= viewStart && node.x - NODE_R <= viewEnd) {
        visible.add(laneKeyOf(node));
      }
    }
    return visible;
  }, [layout, scrollLeft, containerWidth]);

  return (
    <div className="relative">
      {/* Scrolling is driven by dragging / edge auto-scroll, so the native
          horizontal scrollbar is just visual noise — hide it cross-browser.
          The ::-webkit-scrollbar rule can't be expressed inline, hence the
          scoped <style>; scrollbarWidth/msOverflowStyle cover Firefox/IE. */}
      <style>{`.pp-history-scroll::-webkit-scrollbar{display:none}`}</style>
      <div
        ref={containerRef}
        className="pp-history-scroll select-none overflow-x-auto"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
      >
        {nodes.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-base-content/30 text-sm italic">
            Save this {entityType} to create the first history entry.
          </div>
        ) : !measured ? (
          <div
            className="w-full bg-base-300 animate-pulse"
            style={{ height: svgHeight, display: "block" }}
          />
        ) : (
          <svg
            ref={svgRef}
            width={svgW}
            height={svgHeight}
            style={{
              display: "block",
              cursor: "crosshair",
              touchAction: "none",
            }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={stopDrag}
            onPointerCancel={stopDrag}
          >
            <title>Revision history timeline</title>
            <TimelineMarks
              layout={layout}
              edges={edges}
              branchNames={branchNames}
              svgW={svgW}
              selectedId={selectedId}
              dateTimeZone={dateTimeZone}
              onSelectNode={onSelectNode}
            />

            {/* Playhead */}
            {cursorX !== null && (() => {
              const iconSize = 18;
              const iconScale = iconSize / 24;
              const iconCy = svgHeight / 2;
              return (
                <g style={{ pointerEvents: "none" }}>
                  <line x1={cursorX} y1={0} x2={cursorX} y2={svgHeight}
                    stroke="white" strokeWidth={1.5} strokeDasharray="5 4" opacity={0.45}
                  />
                  <g transform={`translate(${cursorX - iconSize / 2}, ${iconCy - iconSize / 2}) scale(${iconScale})`}>
                    <rect x={-2} y={-2} width={28} height={28} rx={5} fill="rgba(10,10,16,0.55)" />
                    <path d="m9 7-5 5 5 5" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={0.8} />
                    <path d="m15 7 5 5-5 5" stroke="white" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={0.8} />
                  </g>
                </g>
              );
            })()}
          </svg>
        )}
      </div>

      {/* Lane labels: fixed to the left edge of the viewport (they live
          outside the scrolling element entirely, so they never move on
          scroll), faded in/out based on whether that lane currently has
          any nodes in view. */}
      {measured && nodes.length > 0 && (
        <div className="absolute inset-0 pointer-events-none">
          <LaneLabel top={MAIN_Y} color={PUBLISH} visible={laneVisible.has("publish")}>
            publish
          </LaneLabel>
          {branchNames.map((name, i) => (
            <LaneLabel key={name} top={laneY(i)} color={DRAFT} visible={laneVisible.has(name)}>
              {name.length > 7 ? `${name.slice(0, 6)}…` : name}
            </LaneLabel>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── HistoryView ──────────────────────────────────────────────────────────────

export default function HistoryView({
  entityType,
  entityId,
  currentContent,
  nodes,
}: HistoryViewProps) {
  const hydrated = useHydrated();
  const createDraftDialogRef = useRef<HTMLDialogElement>(null);
  const canCreateDraft = entityType === "page" || entityType === "content";

  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const sorted = [...nodes].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return sorted[0]?.id ?? null;
  });

  // The legend only needs to know whether any drafts exist; the authoritative
  // ordered branch list is derived inside computeLayout (in TimelineGraph).
  const hasDrafts = useMemo(
    () => nodes.some((n) => n.nodeType === "draft"),
    [nodes]
  );

  const selectedNode =
    selectedId !== null ? (nodes.find((n) => n.id === selectedId) ?? null) : null;

  const [viewport, setViewport] = useState<ViewportKey>("desktop");
  const viewportWidth = VIEWPORTS[viewport].width;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">

      {/* ── Timeline ── */}
      <div className="bg-base-100 border border-base-300 rounded-xl overflow-hidden">
        <div className="px-5 py-2.5 border-b border-base-300 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="text-xs font-semibold text-base-content/50 uppercase tracking-wide">
            History
          </span>
          <span className="flex items-center gap-1.5 text-xs text-base-content/40">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500" />
            Published
          </span>
          {hasDrafts && (
            <span className="flex items-center gap-1.5 text-xs text-base-content/40">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-violet-500" />
              Drafts
            </span>
          )}
          {/* Hint + action: their own full-width line on mobile, inline and
              right-aligned from md up. */}
          <div className="w-full md:w-auto md:ml-auto flex items-center gap-3">
            <span className="text-xs text-base-content/30 italic">
              Drag or click to compare
            </span>
            {canCreateDraft && (
              <button
                type="button"
                className="btn btn-xs btn-outline gap-1.5"
                onClick={() => createDraftDialogRef.current?.showModal()}
              >
                <GitBranchPlus size={12} />
                Create Draft From
              </button>
            )}
          </div>
        </div>

        <TimelineGraph entityType={entityType} nodes={nodes} selectedId={selectedId} onSelect={setSelectedId} />
      </div>

      {/* ── Side-by-side renders (below timeline) ── */}
      <ViewportControls viewport={viewport} onChange={setViewport} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <RenderPanel
          label="Current"
          badge="live"
          badgeClass="badge-success"
          content={currentContent}
          viewportWidth={viewportWidth}
        />

        {selectedNode !== null ? (
          <RenderPanel
            label={
              selectedNode.nodeType === "draft"
                ? `Draft · ${selectedNode.name ?? ""}`
                : "Commit"
            }
            badge={selectedNode.nodeType}
            badgeClass={
              selectedNode.nodeType === "publish"
                ? "badge-primary"
                : "badge-warning"
            }
            viewportWidth={viewportWidth}
            date={
              hydrated ? (
                formatDate(selectedNode.createdAt)
              ) : (
                <span className="inline-block h-3 w-24 align-middle rounded bg-base-300 animate-pulse" />
              )
            }
            content={selectedNode.content}
          />
        ) : (
          <div className="bg-base-100 border border-base-300 rounded-xl flex items-center justify-center min-h-52 text-base-content/30 text-sm italic">
            Select a node on the timeline
          </div>
        )}
      </div>

      {canCreateDraft && (
        <CreateDraftDialog
          dialogRef={createDraftDialogRef}
          entityType={entityType}
          entityId={entityId}
          sourceNode={selectedNode}
        />
      )}
    </div>
  );
}
