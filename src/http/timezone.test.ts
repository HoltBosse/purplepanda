import type { AstroCookies } from 'astro';
import { describe, expect, it } from 'vitest';
import { isValidTimeZone, requestTimeZone } from './timezone';

function cookies(value: string | undefined): AstroCookies {
    return { get: () => (value === undefined ? undefined : { value }) } as unknown as AstroCookies;
}

describe('requestTimeZone', () => {
    it('returns the cookie value when it is a real IANA zone', () => {
        expect(requestTimeZone(cookies('America/New_York'))).toBe('America/New_York');
    });

    it('falls back to UTC when the cookie is missing or bogus', () => {
        expect(requestTimeZone(cookies(undefined))).toBe('UTC');
        expect(requestTimeZone(cookies('Not/AZone'))).toBe('UTC');
        expect(requestTimeZone(cookies("UTC'; drop table x;--"))).toBe('UTC');
    });

    it('rejects bare offsets, which Postgres reads with the opposite sign to Intl', () => {
        expect(requestTimeZone(cookies('+05:30'))).toBe('UTC');
        expect(requestTimeZone(cookies('-0800'))).toBe('UTC');
    });

    it('accepts POSIX-style Etc zones, which both sides read the same way', () => {
        expect(requestTimeZone(cookies('Etc/GMT+5'))).toBe('Etc/GMT+5');
        expect(requestTimeZone(cookies('America/Argentina/Buenos_Aires'))).toBe('America/Argentina/Buenos_Aires');
    });
});

describe('isValidTimeZone', () => {
    it('accepts IANA names and rejects junk', () => {
        expect(isValidTimeZone('Europe/Paris')).toBe(true);
        expect(isValidTimeZone('nope')).toBe(false);
    });
});
