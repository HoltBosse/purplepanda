import { describe, expect, it } from 'vitest';
import { flattenTree, groupByParent, subtreeIds } from './page-tree.js';

type Node = { id: string; parent?: string };

const nodes: Node[] = [
    { id: 'a' },
    { id: 'a1', parent: 'a' },
    { id: 'a1x', parent: 'a1' },
    { id: 'a2', parent: 'a' },
    { id: 'b' },
];
const children = groupByParent(nodes, n => n.parent);

describe('flattenTree', () => {
    it('lists each root followed by its subtree, depth-first', () => {
        const roots = nodes.filter(n => !n.parent);
        expect(flattenTree(roots, children).map(r => [r.page.id, r.depth])).toEqual([
            ['a', 1],
            ['a1', 2],
            ['a1x', 3],
            ['a2', 2],
            ['b', 1],
        ]);
    });

    it('stops at a parent cycle', () => {
        const cyclic: Node[] = [
            { id: 'x', parent: 'y' },
            { id: 'y', parent: 'x' },
        ];
        const rows = flattenTree([cyclic[0]!], groupByParent(cyclic, n => n.parent));
        expect(rows.map(r => r.page.id)).toEqual(['x', 'y']);
    });
});

describe('subtreeIds', () => {
    it('includes the root and every descendant', () => {
        expect([...subtreeIds('a1', children)].sort()).toEqual(['a1', 'a1x']);
        expect([...subtreeIds('a', children)].sort()).toEqual(['a', 'a1', 'a1x', 'a2']);
    });

    it('terminates on a cycle', () => {
        const cyclic: Node[] = [
            { id: 'x', parent: 'y' },
            { id: 'y', parent: 'x' },
        ];
        expect([...subtreeIds('x', groupByParent(cyclic, n => n.parent))].sort()).toEqual(['x', 'y']);
    });
});
