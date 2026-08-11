import type { SlotComponent } from '@puckeditor/core';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import { useBoundItem } from '../data-binding.js';
import CardCollection, { type CardCollectionItem } from './CardCollection';

const puck = (isEditing: boolean) => ({
    renderDropZone: () => null,
    metadata: {},
    isEditing,
    dragRef: null,
});

const CardCollectionRender = CardCollection.render as (props: Record<string, unknown>) => React.JSX.Element;

/** A card template that prints whichever item the surrounding ItemContext supplies. */
const BoundCard: SlotComponent = () => {
    const item = useBoundItem();
    return <span data-testid="card">{String(item?.title ?? 'unbound')}</span>;
};

const items: CardCollectionItem[] = [
    { id: '1', title: 'First' },
    { id: '2', title: 'Second' },
    { id: '3', title: 'Third' },
];

function renderPublished(overrides: Record<string, unknown> = {}) {
    return render(
        <CardCollectionRender
            id="cc1"
            contentType="post"
            limit={10}
            offset={0}
            layout={undefined}
            orderBy={{ field: '', direction: 'desc' }}
            cardTemplate={BoundCard}
            items={items}
            {...overrides}
            puck={puck(false)}
        />,
    );
}

describe('CardCollection published render', () => {
    it('renders one card per item', async () => {
        const screen = await renderPublished();

        expect(screen.container.querySelectorAll('[data-testid="card"]')).toHaveLength(3);
    });

    it('binds each card to its own item via ItemContext', async () => {
        const screen = await renderPublished();

        const rendered = [...screen.container.querySelectorAll('[data-testid="card"]')].map(
            (el) => el.textContent,
        );
        expect(rendered).toEqual(['First', 'Second', 'Third']);
    });

    it('renders an empty grid when there are no items', async () => {
        const screen = await renderPublished({ items: [] });

        expect(screen.container.querySelectorAll('[data-testid="card"]')).toHaveLength(0);
    });

    it('treats missing items the same as an empty list', async () => {
        const screen = await renderPublished({ items: undefined });

        expect(screen.container.querySelectorAll('[data-testid="card"]')).toHaveLength(0);
    });

    it('applies the instance-scoped grid class to the container', async () => {
        const screen = await renderPublished();

        expect(screen.container.querySelector('.CardCollection-cc1')).not.toBeNull();
    });

    it('emits the grid stylesheet alongside the cards', async () => {
        const screen = await renderPublished();

        expect(screen.container.querySelector('style')?.textContent).toContain('.CardCollection-cc1');
    });

    it('lays the container out as a grid', async () => {
        const screen = await renderPublished();

        const grid = screen.container.querySelector<HTMLElement>('.CardCollection-cc1');
        expect(grid && getComputedStyle(grid).display).toBe('grid');
    });

    it('does not render the editing-only preview copies on a published page', async () => {
        const screen = await renderPublished();

        // EditingView labels its non-interactive copies; the published path must not include them.
        expect(screen.container.textContent).not.toContain('Preview');
    });
});
