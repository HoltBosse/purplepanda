import type { Config, Data } from '@puckeditor/core';
import { describe, expect, it, vi } from 'vitest';
import { resolveDataForSSR } from './server-data-wrapper';

function config(components: Record<string, unknown>): Partial<Config> {
    return { components } as unknown as Partial<Config>;
}

function data(content: unknown[]): Data {
    return { root: { props: {} }, content } as unknown as Data;
}

const propsOf = (result: Data, index = 0) =>
    (result.content[index] as unknown as { props: Record<string, unknown> }).props;

describe('resolveDataForSSR', () => {
    it('leaves content untouched when no component declares a resolver', async () => {
        const input = data([{ type: 'Plain', props: { id: 'a', title: 'Hi' } }]);

        const result = await resolveDataForSSR(config({ Plain: { render: () => null } }), input);

        expect(propsOf(result)).toEqual({ id: 'a', title: 'Hi' });
    });

    it('merges a resolver\'s output over the authored props', async () => {
        const input = data([{ type: 'Feed', props: { id: 'a', items: [] } }]);

        const result = await resolveDataForSSR(
            config({ Feed: { data: async () => ({ items: ['one', 'two'] }) } }),
            input,
        );

        expect(propsOf(result)).toEqual({ id: 'a', items: ['one', 'two'] });
    });

    it('passes the authored props and context into the resolver', async () => {
        const dataFn = vi.fn(async () => ({}));
        const input = data([{ type: 'Feed', props: { id: 'a', limit: 5 } }]);

        await resolveDataForSSR(config({ Feed: { data: dataFn } }), input, { alerts: ['x'] });

        expect(dataFn).toHaveBeenCalledWith({ id: 'a', limit: 5 }, { alerts: ['x'] });
    });

    it('keeps the original props when a resolver throws', async () => {
        const input = data([{ type: 'Feed', props: { id: 'a', items: ['kept'] } }]);

        const result = await resolveDataForSSR(
            config({
                Feed: {
                    data: async () => {
                        throw new Error('db down');
                    },
                },
            }),
            input,
        );

        expect(propsOf(result)).toEqual({ id: 'a', items: ['kept'] });
    });

    it('ignores a resolver that returns a non-object', async () => {
        const input = data([{ type: 'Feed', props: { id: 'a' } }]);

        const result = await resolveDataForSSR(config({ Feed: { data: async () => 'nope' } }), input);

        expect(propsOf(result)).toEqual({ id: 'a' });
    });

    it('ignores an unknown component type', async () => {
        const input = data([{ type: 'Missing', props: { id: 'a' } }]);

        const result = await resolveDataForSSR(config({}), input);

        expect(propsOf(result)).toEqual({ id: 'a' });
    });

    // Nested components need their data too, or a resolver inside a slot silently renders empty.
    it('resolves components nested inside a slot', async () => {
        const input = data([
            {
                type: 'Wrapper',
                props: { id: 'w', content: [{ type: 'Feed', props: { id: 'f' } }] },
            },
        ]);

        const result = await resolveDataForSSR(
            config({ Wrapper: {}, Feed: { data: async () => ({ items: ['deep'] }) } }),
            input,
        );

        const nested = (propsOf(result).content as { props: Record<string, unknown> }[])[0];
        expect(nested?.props).toEqual({ id: 'f', items: ['deep'] });
    });

    it('resolves components nested two slots deep', async () => {
        const input = data([
            {
                type: 'Wrapper',
                props: {
                    id: 'w1',
                    content: [
                        { type: 'Wrapper', props: { id: 'w2', content: [{ type: 'Feed', props: { id: 'f' } }] } },
                    ],
                },
            },
        ]);

        const result = await resolveDataForSSR(
            config({ Wrapper: {}, Feed: { data: async () => ({ items: ['deep'] }) } }),
            input,
        );

        const inner = (propsOf(result).content as { props: Record<string, unknown> }[])[0];
        const innerContent = inner?.props.content as { props: Record<string, unknown> }[] | undefined;
        expect(innerContent?.[0]?.props.items).toEqual(['deep']);
    });

    it('flows context down to resolvers nested inside slots', async () => {
        const dataFn = vi.fn(async () => ({}));
        const input = data([
            { type: 'Wrapper', props: { id: 'w', content: [{ type: 'Feed', props: { id: 'f' } }] } },
        ]);

        await resolveDataForSSR(config({ Wrapper: {}, Feed: { data: dataFn } }), input, { locale: 'en' });

        expect(dataFn).toHaveBeenCalledWith({ id: 'f' }, { locale: 'en' });
    });

    it('does not mistake a plain array prop for a slot', async () => {
        const input = data([{ type: 'Plain', props: { id: 'a', tags: ['x', 'y'] } }]);

        const result = await resolveDataForSSR(config({ Plain: {} }), input);

        expect(propsOf(result).tags).toEqual(['x', 'y']);
    });

    it('handles empty content', async () => {
        const result = await resolveDataForSSR(config({}), data([]));

        expect(result.content).toEqual([]);
    });

    it('handles data with no content array', async () => {
        const result = await resolveDataForSSR(config({}), { root: { props: {} } } as unknown as Data);

        expect(result.content).toEqual([]);
    });

    it('preserves root and other top-level keys', async () => {
        const input = { root: { props: { title: 'T' } }, content: [] } as unknown as Data;

        const result = await resolveDataForSSR(config({}), input);

        expect(result.root).toEqual({ props: { title: 'T' } });
    });

    it('resolves sibling components independently', async () => {
        const input = data([
            { type: 'Feed', props: { id: 'a' } },
            { type: 'Feed', props: { id: 'b' } },
        ]);

        const result = await resolveDataForSSR(
            config({ Feed: { data: async (props: Record<string, unknown>) => ({ seen: props.id }) } }),
            input,
        );

        expect(propsOf(result, 0).seen).toBe('a');
        expect(propsOf(result, 1).seen).toBe('b');
    });
});
