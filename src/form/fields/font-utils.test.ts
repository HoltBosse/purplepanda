import { describe, expect, it } from 'vitest';
import { buildFontLink, extractFamilyFromLink, pickDefaultWeights } from './font-utils';

describe('pickDefaultWeights', () => {
    it('prefers regular and bold when both are available', () => {
        expect(pickDefaultWeights([100, 400, 700, 900])).toEqual([400, 700]);
    });

    it('keeps whichever of regular/bold is available', () => {
        expect(pickDefaultWeights([100, 400])).toEqual([400]);
        expect(pickDefaultWeights([700, 900])).toEqual([700]);
    });

    it('falls back to the lightest available weight when neither is offered', () => {
        expect(pickDefaultWeights([300, 500])).toEqual([300]);
    });

    it('falls back to 400 for a font with no weights listed', () => {
        expect(pickDefaultWeights([])).toEqual([400]);
    });

    it('returns weights in preferred order regardless of input order', () => {
        expect(pickDefaultWeights([700, 400])).toEqual([400, 700]);
    });
});

describe('buildFontLink', () => {
    it('builds a Bunny CSS URL for the family and weights', () => {
        const link = buildFontLink('Inter', [400, 700]);
        const url = new URL(link);

        expect(url.origin + url.pathname).toBe('https://fonts.bunny.net/css2');
        expect(url.searchParams.get('family')).toBe('Inter:wght@400;700');
    });

    it('requests swap display so text stays visible while the font loads', () => {
        expect(new URL(buildFontLink('Inter', [400])).searchParams.get('display')).toBe('swap');
    });

    it('encodes a multi-word family name', () => {
        const link = buildFontLink('Open Sans', [400]);

        expect(link).not.toContain(' ');
        expect(new URL(link).searchParams.get('family')).toBe('Open Sans:wght@400');
    });

    it('joins several weights with semicolons', () => {
        expect(new URL(buildFontLink('Inter', [100, 400, 900])).searchParams.get('family')).toBe(
            'Inter:wght@100;400;900',
        );
    });
});

describe('extractFamilyFromLink', () => {
    it('reads the family back out of a generated link', () => {
        expect(extractFamilyFromLink(buildFontLink('Open Sans', [400, 700]))).toBe('Open Sans');
    });

    it('strips the weight suffix', () => {
        expect(extractFamilyFromLink('https://fonts.bunny.net/css2?family=Inter:wght@400')).toBe('Inter');
    });

    it('returns undefined for empty or missing input', () => {
        expect(extractFamilyFromLink(undefined)).toBeUndefined();
        expect(extractFamilyFromLink(null)).toBeUndefined();
        expect(extractFamilyFromLink('')).toBeUndefined();
    });

    it('returns undefined for a malformed URL rather than throwing', () => {
        expect(extractFamilyFromLink('not a url')).toBeUndefined();
    });

    it('returns undefined when the URL carries no family param', () => {
        expect(extractFamilyFromLink('https://fonts.bunny.net/css2?display=swap')).toBeUndefined();
    });

    it('round-trips every family it is given', () => {
        for (const family of ['Inter', 'Open Sans', 'Playfair Display']) {
            expect(extractFamilyFromLink(buildFontLink(family, pickDefaultWeights([400, 700])))).toBe(family);
        }
    });
});
