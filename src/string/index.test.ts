import { describe, it, expect } from 'vitest';
import { capitalize, capitalizeWords } from './index';

describe('capitalize', () => {
    it('capitalizes the first letter', () => {
        expect(capitalize('hello')).toBe('Hello');
    });

    it('returns empty string for empty input', () => {
        expect(capitalize('')).toBe('');
    });

    it('leaves already-capitalized strings unchanged', () => {
        expect(capitalize('Hello')).toBe('Hello');
    });

    it('handles single character', () => {
        expect(capitalize('a')).toBe('A');
    });
});

describe('capitalizeWords', () => {
    it('capitalizes the first letter of each word', () => {
        expect(capitalizeWords('hello world')).toBe('Hello World');
    });

    it('returns empty string for empty input', () => {
        expect(capitalizeWords('')).toBe('');
    });

    it('handles a single word', () => {
        expect(capitalizeWords('hello')).toBe('Hello');
    });

    it('handles already-capitalized words', () => {
        expect(capitalizeWords('Hello World')).toBe('Hello World');
    });

    it('handles multiple spaces between words', () => {
        expect(capitalizeWords('hello  world')).toBe('Hello  World');
    });
});
