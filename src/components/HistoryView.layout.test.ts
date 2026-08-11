import { describe, expect, it } from 'vitest';
import { computeLayout, type DagNodeData, LANE_GAP, MAIN_Y, PAD_X } from './history-layout';

function node(overrides: Partial<DagNodeData> & Pick<DagNodeData, 'id' | 'nodeType' | 'createdAt'>): DagNodeData {
    return {
        name: null,
        parentId: null,
        content: {},
        state: 1,
        ...overrides,
    };
}

const publish = (id: string, createdAt: string) => node({ id, nodeType: 'publish', createdAt });
const draft = (id: string, createdAt: string, name: string | null) =>
    node({ id, nodeType: 'draft', createdAt, name });

const WIDTH = 1000;

describe('computeLayout', () => {
    it('returns an empty layout for no nodes', () => {
        const result = computeLayout([], WIDTH);

        expect(result.layout).toEqual([]);
        expect(result.branchNames).toEqual([]);
    });

    it('returns an empty layout before the container has been measured', () => {
        // On first render the SVG width is still 0; laying out then would stack every node at the
        // same x and flash a collapsed graph.
        const result = computeLayout([publish('a', '2024-01-01T00:00:00Z')], 0);

        expect(result.layout).toEqual([]);
    });

    it('still reports a height when there is nothing to lay out, so the container holds its size', () => {
        expect(computeLayout([], 0).svgHeight).toBe(MAIN_Y + LANE_GAP + 20);
    });

    it('orders nodes chronologically regardless of input order', () => {
        const result = computeLayout(
            [
                publish('third', '2024-03-01T00:00:00Z'),
                publish('first', '2024-01-01T00:00:00Z'),
                publish('second', '2024-02-01T00:00:00Z'),
            ],
            WIDTH,
        );

        expect(result.layout.map((n) => n.id)).toEqual(['first', 'second', 'third']);
    });

    it('does not mutate the caller\'s array while sorting', () => {
        const nodes = [publish('b', '2024-02-01T00:00:00Z'), publish('a', '2024-01-01T00:00:00Z')];
        computeLayout(nodes, WIDTH);

        expect(nodes.map((n) => n.id)).toEqual(['b', 'a']);
    });

    it('centres a lone node rather than pinning it to the left edge', () => {
        const result = computeLayout([publish('only', '2024-01-01T00:00:00Z')], WIDTH);

        expect(result.layout[0]?.x).toBe(PAD_X + (WIDTH - PAD_X * 2) / 2);
    });

    it('spreads nodes evenly from padding edge to padding edge', () => {
        const result = computeLayout(
            [
                publish('a', '2024-01-01T00:00:00Z'),
                publish('b', '2024-02-01T00:00:00Z'),
                publish('c', '2024-03-01T00:00:00Z'),
            ],
            WIDTH,
        );

        const usable = WIDTH - PAD_X * 2;
        expect(result.layout.map((n) => n.x)).toEqual([PAD_X, PAD_X + usable / 2, PAD_X + usable]);
    });

    it('keeps every publish node on the main line', () => {
        const result = computeLayout(
            [publish('a', '2024-01-01T00:00:00Z'), publish('b', '2024-02-01T00:00:00Z')],
            WIDTH,
        );

        expect(result.layout.every((n) => n.y === MAIN_Y)).toBe(true);
    });

    it('collects draft branch names in order of first appearance', () => {
        const result = computeLayout(
            [
                draft('d2', '2024-02-01T00:00:00Z', 'beta'),
                draft('d1', '2024-01-01T00:00:00Z', 'alpha'),
                draft('d3', '2024-03-01T00:00:00Z', 'beta'),
            ],
            WIDTH,
        );

        expect(result.branchNames).toEqual(['alpha', 'beta']);
    });

    it('ignores publish nodes when collecting branch names', () => {
        const result = computeLayout(
            [publish('p', '2024-01-01T00:00:00Z'), draft('d', '2024-02-01T00:00:00Z', 'alpha')],
            WIDTH,
        );

        expect(result.branchNames).toEqual(['alpha']);
    });

    it('groups unnamed drafts under a single "draft" lane', () => {
        const result = computeLayout(
            [draft('d1', '2024-01-01T00:00:00Z', null), draft('d2', '2024-02-01T00:00:00Z', null)],
            WIDTH,
        );

        expect(result.branchNames).toEqual(['draft']);
        expect(result.layout[0]?.y).toBe(result.layout[1]?.y);
    });

    it('stacks each draft branch in its own lane below the main line', () => {
        const result = computeLayout(
            [draft('d1', '2024-01-01T00:00:00Z', 'alpha'), draft('d2', '2024-02-01T00:00:00Z', 'beta')],
            WIDTH,
        );

        expect(result.layout[0]?.y).toBe(MAIN_Y + LANE_GAP);
        expect(result.layout[1]?.y).toBe(MAIN_Y + LANE_GAP * 2);
    });

    it('puts every node of the same branch on the same lane', () => {
        const result = computeLayout(
            [
                draft('d1', '2024-01-01T00:00:00Z', 'alpha'),
                draft('d2', '2024-02-01T00:00:00Z', 'beta'),
                draft('d3', '2024-03-01T00:00:00Z', 'alpha'),
            ],
            WIDTH,
        );

        const byId = new Map(result.layout.map((n) => [n.id, n.y]));
        expect(byId.get('d1')).toBe(byId.get('d3'));
        expect(byId.get('d1')).not.toBe(byId.get('d2'));
    });

    it('grows the canvas height with each additional branch', () => {
        const oneBranch = computeLayout([draft('d1', '2024-01-01T00:00:00Z', 'alpha')], WIDTH);
        const twoBranches = computeLayout(
            [draft('d1', '2024-01-01T00:00:00Z', 'alpha'), draft('d2', '2024-02-01T00:00:00Z', 'beta')],
            WIDTH,
        );

        expect(twoBranches.svgHeight - oneBranch.svgHeight).toBe(LANE_GAP);
    });

    it('reserves height for the main line even with no branches', () => {
        const result = computeLayout([publish('a', '2024-01-01T00:00:00Z')], WIDTH);

        expect(result.svgHeight).toBe(MAIN_Y + LANE_GAP + 20);
    });

    it('never places a node left of the padding, even on a very narrow canvas', () => {
        const result = computeLayout(
            [publish('a', '2024-01-01T00:00:00Z'), publish('b', '2024-02-01T00:00:00Z')],
            10,
        );

        expect(result.layout.every((n) => n.x >= PAD_X)).toBe(true);
    });

    it('carries the original node data through to the laid-out nodes', () => {
        const result = computeLayout([draft('d1', '2024-01-01T00:00:00Z', 'alpha')], WIDTH);

        expect(result.layout[0]).toMatchObject({ id: 'd1', nodeType: 'draft', name: 'alpha' });
    });
});
