// Pure geometry for the history DAG in HistoryView.tsx. Kept in its own module so it carries no
// React or Astro imports — HistoryView pulls in PageRenderer, which imports the
// `virtual:purplepanda/puck-config` module that only exists inside an Astro build.

export const MAIN_Y = 44;
export const LANE_GAP = 52;
export const PAD_X = 64;

/** Y of the draft lane at index `i` (publish lives on MAIN_Y, drafts stack below). */
export const laneY = (i: number) => MAIN_Y + LANE_GAP * (i + 1);

export interface DagNodeData {
  id: string;
  nodeType: "publish" | "draft";
  name: string | null;
  createdAt: string;
  parentId: string | null;
  content: Record<string, unknown>;
  state: number;
}

export interface LayoutNode extends DagNodeData {
  x: number;
  y: number;
}

export interface LayoutResult {
  layout: LayoutNode[];
  branchNames: string[];
  svgHeight: number;
}

export function computeLayout(nodes: DagNodeData[], svgWidth: number): LayoutResult {
  // Collect branch names in chronological order of first appearance
  const sorted = [...nodes].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const branchNames: string[] = [];
  const seen = new Set<string>();
  for (const node of sorted) {
    if (node.nodeType === "draft") {
      const key = node.name ?? "draft";
      if (!seen.has(key)) {
        seen.add(key);
        branchNames.push(key);
      }
    }
  }

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
