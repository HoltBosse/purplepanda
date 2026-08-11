import type { Data } from '@puckeditor/core';
import { describe, expect, it } from 'vitest';
import {
    ensureTemplateSlot,
    hasTemplateSlot,
    TEMPLATE_SLOT_FALLBACK_ID,
    TEMPLATE_SLOT_TYPE,
} from './template-slot';

const slot = { type: TEMPLATE_SLOT_TYPE, props: { id: 'TemplateSlot-1' } };
const heading = { type: 'Heading', props: { id: 'Heading-1', title: 'Hi' } };

function data(content: unknown[]): Data {
    return { root: { props: {} }, content } as unknown as Data;
}

describe('hasTemplateSlot', () => {
    it('finds a slot at the top level of content', () => {
        expect(hasTemplateSlot(data([heading, slot]))).toBe(true);
    });

    it('returns false when no slot is present', () => {
        expect(hasTemplateSlot(data([heading]))).toBe(false);
    });

    it('returns false for empty content', () => {
        expect(hasTemplateSlot(data([]))).toBe(false);
    });

    // The marker can be dropped inside another component's slot, e.g. wrapped in Margin or Flex,
    // so a top-level-only scan would miss it and wrongly append a second one.
    it('finds a slot nested inside another component', () => {
        const nested = data([{ type: 'Margin', props: { id: 'm1', content: [slot] } }]);

        expect(hasTemplateSlot(nested)).toBe(true);
    });

    it('finds a slot nested several levels deep', () => {
        const deep = data([
            {
                type: 'Margin',
                props: { id: 'm1', content: [{ type: 'Flex', props: { id: 'f1', items: [slot] } }] },
            },
        ]);

        expect(hasTemplateSlot(deep)).toBe(true);
    });

    it('handles primitives and nullish values without throwing', () => {
        for (const value of [null, undefined, 0, '', 'TemplateSlot', true, Number.NaN]) {
            expect(hasTemplateSlot(value)).toBe(false);
        }
    });

    it('does not treat a matching type on a nested plain object as a false negative', () => {
        expect(hasTemplateSlot({ anything: { deeper: { type: TEMPLATE_SLOT_TYPE } } })).toBe(true);
    });

    it('does not match a component whose type merely contains the marker name', () => {
        expect(hasTemplateSlot(data([{ type: 'TemplateSlotPlaceholder', props: {} }]))).toBe(false);
    });
});

describe('ensureTemplateSlot', () => {
    it('returns the data untouched when a slot already exists', () => {
        const input = data([heading, slot]);

        expect(ensureTemplateSlot(input)).toBe(input);
    });

    it('returns the data untouched when the slot is nested', () => {
        const input = data([{ type: 'Margin', props: { id: 'm1', content: [slot] } }]);

        expect(ensureTemplateSlot(input)).toBe(input);
    });

    // Without this, a template saved with no slot would silently swallow every page using it.
    it('appends a fallback slot when none exists', () => {
        const result = ensureTemplateSlot(data([heading]));

        expect(result.content).toHaveLength(2);
        expect(result.content[1]).toMatchObject({
            type: TEMPLATE_SLOT_TYPE,
            props: { id: TEMPLATE_SLOT_FALLBACK_ID },
        });
    });

    it('appends the fallback after existing content rather than replacing it', () => {
        const result = ensureTemplateSlot(data([heading]));

        expect(result.content[0]).toBe(heading);
    });

    it('does not mutate the input data', () => {
        const input = data([heading]);
        ensureTemplateSlot(input);

        expect(input.content).toHaveLength(1);
    });

    it('preserves root and other top-level keys', () => {
        const input = { root: { props: { title: 'T' } }, content: [], zones: {} } as unknown as Data;
        const result = ensureTemplateSlot(input);

        expect(result.root).toBe(input.root);
        expect((result as unknown as { zones: unknown }).zones).toBe(
            (input as unknown as { zones: unknown }).zones,
        );
    });

    it('handles data with no content array at all', () => {
        const result = ensureTemplateSlot({ root: { props: {} } } as unknown as Data);

        expect(result.content).toHaveLength(1);
        expect(result.content[0]).toMatchObject({ type: TEMPLATE_SLOT_TYPE });
    });

    it('produces data that then satisfies hasTemplateSlot', () => {
        expect(hasTemplateSlot(ensureTemplateSlot(data([heading])))).toBe(true);
    });
});
