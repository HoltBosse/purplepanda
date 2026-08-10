import { describe, expect, it } from 'vitest';
import { searchFieldSpecSchema, searchFieldsConfigSchema, valueSchemaForField } from './schema';

describe('searchFieldSpecSchema', () => {
    it('accepts a minimal valid text field', () => {
        const result = searchFieldSpecSchema.safeParse({ name: 'title', type: 'text' });
        expect(result.success).toBe(true);
    });

    it('accepts an enum field with a non-empty enumValues list', () => {
        const result = searchFieldSpecSchema.safeParse({
            name: 'state',
            type: 'enum',
            enumValues: ['enabled', 'disabled'],
        });
        expect(result.success).toBe(true);
    });

    it('rejects an enum field with no enumValues', () => {
        const result = searchFieldSpecSchema.safeParse({ name: 'state', type: 'enum' });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0]?.path).toEqual(['enumValues']);
        }
    });

    it('rejects an enum field with an empty enumValues array', () => {
        const result = searchFieldSpecSchema.safeParse({ name: 'state', type: 'enum', enumValues: [] });
        expect(result.success).toBe(false);
    });

    it('rejects a name that is not a valid identifier', () => {
        expect(searchFieldSpecSchema.safeParse({ name: '2bad', type: 'text' }).success).toBe(false);
        expect(searchFieldSpecSchema.safeParse({ name: 'has space', type: 'text' }).success).toBe(false);
        expect(searchFieldSpecSchema.safeParse({ name: '', type: 'text' }).success).toBe(false);
    });

    it('rejects an unknown field type', () => {
        const result = searchFieldSpecSchema.safeParse({ name: 'title', type: 'bogus' });
        expect(result.success).toBe(false);
    });
});

describe('searchFieldsConfigSchema', () => {
    it('accepts an array of valid field specs', () => {
        const result = searchFieldsConfigSchema.safeParse([
            { name: 'title', type: 'text' },
            { name: 'state', type: 'enum', enumValues: ['a', 'b'] },
        ]);
        expect(result.success).toBe(true);
    });

    it('rejects the array if any entry is invalid', () => {
        const result = searchFieldsConfigSchema.safeParse([
            { name: 'title', type: 'text' },
            { name: 'state', type: 'enum' },
        ]);
        expect(result.success).toBe(false);
    });
});

describe('valueSchemaForField', () => {
    it('accepts only "true"/"false" for boolean fields', () => {
        const schema = valueSchemaForField({ type: 'boolean' });
        expect(schema.safeParse('true').success).toBe(true);
        expect(schema.safeParse('false').success).toBe(true);
        expect(schema.safeParse('True').success).toBe(false);
        expect(schema.safeParse('yes').success).toBe(false);
    });

    it('accepts only ISO dates for date fields', () => {
        const schema = valueSchemaForField({ type: 'date' });
        expect(schema.safeParse('2020-01-01').success).toBe(true);
        expect(schema.safeParse('01/01/2020').success).toBe(false);
        expect(schema.safeParse('2020-01-01T00:00:00').success).toBe(false);
    });

    it('accepts ISO date or local datetime for datetime fields', () => {
        const schema = valueSchemaForField({ type: 'datetime' });
        expect(schema.safeParse('2020-01-01').success).toBe(true);
        expect(schema.safeParse('2020-01-01T12:30:00').success).toBe(true);
        expect(schema.safeParse('not-a-date').success).toBe(false);
    });

    it('accepts only ISO time for time fields', () => {
        const schema = valueSchemaForField({ type: 'time' });
        expect(schema.safeParse('12:30:00').success).toBe(true);
        expect(schema.safeParse('noon').success).toBe(false);
    });

    it('accepts only the configured literals for enum fields', () => {
        const schema = valueSchemaForField({ type: 'enum', enumValues: ['a', 'b'] });
        expect(schema.safeParse('a').success).toBe(true);
        expect(schema.safeParse('c').success).toBe(false);
    });

    it('rejects everything for an enum field with no enumValues', () => {
        const schema = valueSchemaForField({ type: 'enum' });
        expect(schema.safeParse('anything').success).toBe(false);
    });

    it('requires a non-empty string for text fields', () => {
        const schema = valueSchemaForField({ type: 'text' });
        expect(schema.safeParse('hello').success).toBe(true);
        expect(schema.safeParse('').success).toBe(false);
    });
});
