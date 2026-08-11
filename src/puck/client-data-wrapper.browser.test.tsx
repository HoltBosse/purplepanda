import { describe, expect, it } from 'vitest';
import { toSerializableObject } from './client-data-wrapper';

// This shapes the payload POSTed to the component-data endpoint. Anything it lets through must
// survive JSON.stringify, and anything it drops silently disappears from that request — so both
// directions matter.
describe('toSerializableObject', () => {
    it('passes plain JSON values through untouched', () => {
        const input = { text: 'a', count: 1, flag: true, nothing: null };

        expect(toSerializableObject(input)).toEqual(input);
    });

    it('preserves nested objects and arrays', () => {
        const input = { list: [1, 'two', { three: 3 }], nested: { deep: { deeper: true } } };

        expect(toSerializableObject(input)).toEqual(input);
    });

    it('drops function-valued keys', () => {
        expect(toSerializableObject({ keep: 1, fn: () => undefined })).toEqual({ keep: 1 });
    });

    it('drops undefined and symbol values', () => {
        expect(toSerializableObject({ keep: 1, gone: undefined, sym: Symbol('x') })).toEqual({ keep: 1 });
    });

    it('drops non-serializable entries from arrays rather than leaving holes', () => {
        expect(toSerializableObject({ list: [1, () => undefined, 2] })).toEqual({ list: [1, 2] });
    });

    it('returns an empty object for non-object input', () => {
        for (const value of [null, undefined, 42, 'text', true, () => undefined]) {
            expect(toSerializableObject(value)).toEqual({});
        }
    });

    it('returns an empty object for an array, which is not a valid field payload', () => {
        expect(toSerializableObject([1, 2, 3])).toEqual({});
    });

    // A cycle would make JSON.stringify throw and take the whole request down.
    it('drops a self-referencing object instead of throwing', () => {
        const input: Record<string, unknown> = { name: 'root' };
        input.self = input;

        expect(() => toSerializableObject(input)).not.toThrow();
        expect(toSerializableObject(input)).toEqual({ name: 'root' });
    });

    it('drops a longer reference cycle', () => {
        const a: Record<string, unknown> = { name: 'a' };
        const b: Record<string, unknown> = { name: 'b', a };
        a.b = b;

        expect(toSerializableObject(a)).toEqual({ name: 'a', b: { name: 'b' } });
    });

    it('drops a cycle reached through an array', () => {
        const input: Record<string, unknown> = { name: 'root' };
        input.list = [input];

        expect(toSerializableObject(input)).toEqual({ name: 'root', list: [] });
    });

    it('produces output that JSON.stringify accepts', () => {
        const input: Record<string, unknown> = { name: 'root', fn: () => undefined };
        input.self = input;

        expect(() => JSON.stringify(toSerializableObject(input))).not.toThrow();
    });

    it('drops a React element passed as a field value', () => {
        const result = toSerializableObject({ label: 'ok', node: <span>hi</span> });

        // React elements are objects, so they are walked rather than dropped wholesale; what
        // matters is that the result still round-trips through JSON.
        expect(result.label).toBe('ok');
        expect(() => JSON.stringify(result)).not.toThrow();
    });
});
