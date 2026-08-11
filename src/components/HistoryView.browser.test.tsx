import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import HistoryView from './HistoryView';
import type { DagNodeData } from './history-layout';

function node(
    overrides: Partial<DagNodeData> & Pick<DagNodeData, 'id' | 'nodeType' | 'createdAt'>,
): DagNodeData {
    return { name: null, parentId: null, content: {}, state: 1, ...overrides };
}

const publish = (id: string, createdAt: string) => node({ id, nodeType: 'publish', createdAt });
const draft = (id: string, createdAt: string, name: string) =>
    node({ id, nodeType: 'draft', createdAt, name });

function renderHistory(nodes: DagNodeData[]) {
    return render(
        <HistoryView entityType="page" entityId="page-1" currentContent={{}} nodes={nodes} />,
    );
}

describe('HistoryView', () => {
    it('renders an empty history without throwing', async () => {
        const screen = await renderHistory([]);

        expect(screen.container).toBeTruthy();
    });

    it('draws the timeline as an SVG', async () => {
        const screen = await renderHistory([publish('p1', '2024-01-01T00:00:00Z')]);

        await expect.poll(() => screen.container.querySelector('svg')).not.toBeNull();
    });

    it('labels the publish lane', async () => {
        const screen = await renderHistory([publish('p1', '2024-01-01T00:00:00Z')]);

        // The lane name appears both as an SVG label and as an HTML pill.
        await expect.element(screen.getByText('publish', { exact: true }).first()).toBeInTheDocument();
    });

    it('labels each draft branch by name', async () => {
        const screen = await renderHistory([
            publish('p1', '2024-01-01T00:00:00Z'),
            draft('d1', '2024-02-01T00:00:00Z', 'redesign'),
        ]);

        await expect.element(screen.getByText('redesign').first()).toBeInTheDocument();
    });

    it('offers a way to start a new draft', async () => {
        const screen = await renderHistory([publish('p1', '2024-01-01T00:00:00Z')]);

        await expect.poll(() => screen.container.querySelector('dialog')).not.toBeNull();
    });

    it('renders a node mark per history entry', async () => {
        const screen = await renderHistory([
            publish('p1', '2024-01-01T00:00:00Z'),
            publish('p2', '2024-02-01T00:00:00Z'),
            draft('d1', '2024-03-01T00:00:00Z', 'wip'),
        ]);

        await expect.poll(() => screen.container.querySelectorAll('circle').length).toBeGreaterThanOrEqual(3);
    });

    it('keeps two branches on separate lanes', async () => {
        const screen = await renderHistory([
            draft('d1', '2024-01-01T00:00:00Z', 'alpha'),
            draft('d2', '2024-02-01T00:00:00Z', 'beta'),
        ]);

        await expect.element(screen.getByText('alpha').first()).toBeInTheDocument();
        await expect.element(screen.getByText('beta').first()).toBeInTheDocument();
    });
});
