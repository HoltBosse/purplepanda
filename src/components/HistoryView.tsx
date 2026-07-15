import React, {
  useState,
  useRef,
  useCallback,
  useEffect,
  useMemo,
} from "react";
import { createPortal } from "react-dom";
import type { Data } from "@puckeditor/core";
import PageRenderer from "./PageRenderer.js";

// ─── Layout constants ─────────────────────────────────────────────────────────

const MAIN_Y = 44;
const LANE_GAP = 52;
const PAD_X = 64;
const NODE_R = 7;
const MIN_COL_W = 56;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DagNodeData {
  id: string;
  nodeType: "publish" | "draft";
  name: string | null;
  createdAt: string;
  parentId: string | null;
  content: Record<string, unknown>;
  state: number;
}

interface LayoutNode extends DagNodeData {
  x: number;
  y: number;
}

type EdgeKind = "main" | "branch-off" | "branch-line" | "merge-back";

interface Edge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  kind: EdgeKind;
}

export interface HistoryViewProps {
  entityType: "page" | "template" | "content" | "form";
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

interface LayoutResult {
  layout: LayoutNode[];
  branchNames: string[];
  svgHeight: number;
}

function computeLayout(nodes: DagNodeData[], svgWidth: number): LayoutResult {
  // Collect branch names in chronological order of first appearance
  const sorted = [...nodes].sort(
    (a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const branchNames: string[] = [];
  const seen = new Set<string>();
  for (const node of sorted) {
    if (node.nodeType === "draft") {
      const key = node.name ?? "draft";
      if (!seen.has(key)) { seen.add(key); branchNames.push(key); }
    }
  }

  const laneY = (branchIdx: number) => MAIN_Y + LANE_GAP * (branchIdx + 1);
  const svgHeight = MAIN_Y + LANE_GAP * (branchNames.length + 1) + 20;

  if (svgWidth <= 0 || nodes.length === 0) {
    return { layout: [], branchNames, svgHeight };
  }

  const n = sorted.length;
  const usable = Math.max(0, svgWidth - PAD_X * 2);

  const layout = sorted.map((node, i) => {
    const x = n === 1 ? PAD_X + usable / 2 : PAD_X + (i / (n - 1)) * usable;
    const y =
      node.nodeType === "publish"
        ? MAIN_Y
        : laneY(branchNames.indexOf(node.name ?? "draft"));
    return { ...node, x, y };
  });

  return { layout, branchNames, svgHeight };
}

// ─── PreviewFrame ────────────────────────────────────────────────────────────

// Renders children inside an iframe (via portal) so the preview picks up the
// site's own stylesheets and behaves like the actual page, rather than
// inheriting styles/theme from the admin shell it's embedded in.
function PreviewFrame({ children }: { children: React.ReactNode }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const setup = () => {
      const doc = iframe.contentDocument;
      if (!doc) return;

      doc.documentElement.setAttribute("data-theme", "false");
      doc.body.style.margin = "0";

      document
        .querySelectorAll('link[rel="stylesheet"], style')
        .forEach((node) => doc.head.appendChild(node.cloneNode(true)));

      setMountNode(doc.body);
    };

    if (iframe.contentDocument?.readyState === "complete") {
      setup();
    } else {
      iframe.addEventListener("load", setup);
    }

    return () => iframe.removeEventListener("load", setup);
  }, []);

  return (
    <>
      <iframe
        ref={iframeRef}
        title="Page preview"
        style={{ width: "100%", height: "600px", border: "none", display: "block" }}
      />
      {mountNode ? createPortal(children, mountNode) : null}
    </>
  );
}

// ─── RenderPanel ─────────────────────────────────────────────────────────────

function RenderPanel({
  label,
  badge,
  badgeClass,
  date,
  content,
}: {
  label: string;
  badge?: string;
  badgeClass?: string;
  date?: React.ReactNode;
  content: Record<string, unknown>;
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
      <PreviewFrame>
        <PageRenderer pageData={content as unknown as Data} />
      </PreviewFrame>
    </div>
  );
}

// ─── HistoryView ──────────────────────────────────────────────────────────────

export default function HistoryView({
  entityType,
  currentContent,
  nodes,
}: HistoryViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const isDragging = useRef(false);
  const hydrated = useHydrated();
  const dateTimeZone = hydrated ? undefined : "UTC";

  const [selectedId, setSelectedId] = useState<string | null>(() => {
    const sorted = [...nodes].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return sorted[0]?.id ?? null;
  });

  const [cursorX, setCursorX] = useState<number | null>(null);
  const [measured, setMeasured] = useState(false);

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

  const svgW = Math.max(
    containerWidth,
    PAD_X * 2 + Math.max(0, nodes.length - 1) * MIN_COL_W
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

  const applyX = useCallback(
    (svgX: number) => {
      const nearest = findNearest(svgX);
      if (nearest) {
        setCursorX(nearest.x);
        setSelectedId(nearest.id);
      }
    },
    [findNearest]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      isDragging.current = true;
      const rect = e.currentTarget.getBoundingClientRect();
      applyX(e.clientX - rect.left);
    },
    [applyX]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!isDragging.current) return;
      const rect = e.currentTarget.getBoundingClientRect();
      applyX(e.clientX - rect.left);
    },
    [applyX]
  );

  const stopDrag = useCallback(() => {
    isDragging.current = false;
  }, []);

  useEffect(() => {
    window.addEventListener("mouseup", stopDrag);
    return () => window.removeEventListener("mouseup", stopDrag);
  }, [stopDrag]);

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

  const selectedNode =
    selectedId !== null ? (layoutById.get(selectedId) ?? null) : null;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">

      {/* ── Timeline ── */}
      <div className="bg-base-100 border border-base-300 rounded-xl overflow-hidden">
        <div className="px-5 py-2.5 border-b border-base-300 flex items-center gap-3">
          <span className="text-xs font-semibold text-base-content/50 uppercase tracking-wide">
            History
          </span>
          <span className="flex items-center gap-1.5 text-xs text-base-content/40">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-blue-500" />
            Published
          </span>
          {branchNames.length > 0 && (
            <span className="flex items-center gap-1.5 text-xs text-base-content/40">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-violet-500" />
              Drafts
            </span>
          )}
          <span className="ml-auto text-xs text-base-content/30 italic">
            Drag or click to compare
          </span>
        </div>

        <div ref={containerRef} className="relative select-none overflow-x-auto">
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
              width={svgW}
              height={svgHeight}
              style={{ display: "block", cursor: "crosshair" }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={stopDrag}
              onMouseLeave={stopDrag}
            >
              {/* Publish lane */}
              <line
                x1={PAD_X - 12} y1={MAIN_Y} x2={svgW - 16} y2={MAIN_Y}
                stroke="#3b82f6" strokeWidth={0.5} strokeOpacity={0.18} strokeDasharray="4 5"
              />
              <rect x={4} y={MAIN_Y - 11} width={52} height={22} rx={11}
                fill="rgba(59,130,246,0.1)" stroke="rgba(59,130,246,0.3)" strokeWidth={0.5} />
              <text x={30} y={MAIN_Y} textAnchor="middle" dominantBaseline="central"
                fontSize={9} fontFamily="ui-monospace,monospace" fontWeight={500} fill="#60a5fa">
                publish
              </text>

              {/* Per-branch draft lanes */}
              {branchNames.map((name, i) => {
                const y = MAIN_Y + LANE_GAP * (i + 1);
                return (
                  <g key={name}>
                    <line
                      x1={PAD_X - 12} y1={y} x2={svgW - 16} y2={y}
                      stroke="#8b5cf6" strokeWidth={0.5} strokeOpacity={0.18} strokeDasharray="4 5"
                    />
                    <rect x={4} y={y - 11} width={52} height={22} rx={11}
                      fill="rgba(139,92,246,0.1)" stroke="rgba(139,92,246,0.3)" strokeWidth={0.5} />
                    <text x={30} y={y} textAnchor="middle" dominantBaseline="central"
                      fontSize={9} fontFamily="ui-monospace,monospace" fontWeight={500} fill="#a78bfa">
                      {name.length > 7 ? name.slice(0, 6) + "…" : name}
                    </text>
                  </g>
                );
              })}

              {/* Edges */}
              {edges.map((edge, i) => {
                if (edge.kind === "main") {
                  return (
                    <line key={i}
                      x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2}
                      stroke="#3b82f6" strokeWidth={2} strokeLinecap="round" opacity={0.6}
                    />
                  );
                }
                if (edge.kind === "branch-line") {
                  return (
                    <line key={i}
                      x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2}
                      stroke="#8b5cf6" strokeWidth={1.5} strokeLinecap="round"
                      strokeDasharray="4 3" opacity={0.6}
                    />
                  );
                }
                const sdx = edge.x2 - edge.x1;
                const cp = Math.abs(sdx) * 0.55;
                const d = `M ${edge.x1} ${edge.y1} C ${edge.x1 + (sdx > 0 ? cp : -cp)} ${edge.y1} ${edge.x2 - (sdx > 0 ? cp : -cp)} ${edge.y2} ${edge.x2} ${edge.y2}`;
                return (
                  <path key={i} d={d} stroke="#8b5cf6"
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
                const fill = isPublish ? "#3b82f6" : "#8b5cf6";
                const r = isSelected ? NODE_R + 3 : NODE_R;
                const label = shortDate(node.createdAt, dateTimeZone);
                const labelY = isPublish ? node.y - NODE_R - 10 : node.y + NODE_R + 13;

                return (
                  <g key={node.id}
                    onClick={() => { setSelectedId(node.id); setCursorX(node.x); }}
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
      </div>

      {/* ── Side-by-side renders (below timeline) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <RenderPanel
          label="Current"
          badge="live"
          badgeClass="badge-success"
          content={currentContent}
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
    </div>
  );
}
