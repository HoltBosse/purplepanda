import type { PuckContext, SlotComponent } from '@puckeditor/core';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-react';
import Accordion from './Accordion';

const fakePuck: PuckContext = {
    renderDropZone: () => null,
    metadata: {},
    isEditing: false,
    dragRef: null,
};

const summarySlot =
    (text: string): SlotComponent =>
    () => <>{text}</>;
const contentSlot =
    (text: string): SlotComponent =>
    (props) => <div {...props}>{text}</div>;

/** Builds the `summaryN`/`contentN` slot props Accordion expects for `itemCount` items. */
function accordionProps(itemCount: number, join: 'yes' | 'no' = 'no') {
    const props: Record<string, unknown> = { itemCount, join };
    for (let i = 1; i <= itemCount; i++) {
        props[`summary${i}`] = summarySlot(`Summary ${i}`);
        props[`content${i}`] = contentSlot(`Content ${i}`);
    }
    // AccordionProps declares summary1..8/content1..8; a test only fills the ones it renders.
    return props as any;
}

function renderAccordion(itemCount: number, join: 'yes' | 'no' = 'no', overrides = {}) {
    return render(
        <Accordion.render id="a" {...accordionProps(itemCount, join)} {...overrides} puck={fakePuck} />,
    );
}

describe('Accordion render', () => {
    it('renders one <details> per item with its summary', async () => {
        const screen = await renderAccordion(3);

        expect(screen.container.querySelectorAll('details')).toHaveLength(3);
        for (let i = 1; i <= 3; i++) {
            await expect.element(screen.getByText(`Summary ${i}`)).toBeInTheDocument();
        }
    });

    it('keeps content hidden until its summary is clicked open', async () => {
        const screen = await renderAccordion(2);

        const content = screen.getByText('Content 1');
        await expect.element(content).not.toBeVisible();

        await screen.getByText('Summary 1').click();
        await expect.element(content).toBeVisible();
    });

    it('opening one item closes the other, via the shared <details> group name', async () => {
        const screen = await renderAccordion(2);

        await screen.getByText('Summary 1').click();
        await expect.element(screen.getByText('Content 1')).toBeVisible();

        await screen.getByText('Summary 2').click();
        await expect.element(screen.getByText('Content 2')).toBeVisible();
        await expect.element(screen.getByText('Content 1')).not.toBeVisible();
    });

    it('gives two accordion instances different group names, so they open independently', async () => {
        const first = await render(<Accordion.render id="one" {...accordionProps(1)} puck={fakePuck} />);
        const second = await render(<Accordion.render id="two" {...accordionProps(1)} puck={fakePuck} />);

        const nameOf = (c: HTMLElement) => c.querySelector('details')?.getAttribute('name');
        expect(nameOf(first.container)).not.toBe(nameOf(second.container));
    });

    it('clamps itemCount to at most 8', async () => {
        const screen = await renderAccordion(8, 'no', { itemCount: 20 });

        expect(screen.container.querySelectorAll('details')).toHaveLength(8);
    });

    it('clamps itemCount to at least 1', async () => {
        const screen = await renderAccordion(1, 'no', { itemCount: 0 });

        expect(screen.container.querySelectorAll('details')).toHaveLength(1);
    });

    it('applies the joined layout class only when join is "yes"', async () => {
        const joined = await renderAccordion(1, 'yes');
        expect(joined.container.querySelector('.join.join-vertical')).not.toBeNull();

        const notJoined = await renderAccordion(1, 'no');
        expect(notJoined.container.querySelector('.join.join-vertical')).toBeNull();
    });
});
