import { describe, expect, it, vi } from 'vitest';

// The limiters are built against Postgres at import; the schemas under test never touch them.
vi.mock('./login-throttle.js', () => ({ accountKey: (s: string) => s, limiter: () => ({}) }));
vi.mock('../db/db.js', () => ({ getDb: () => ({}) }));

const { forgotPasswordSchema, resetPasswordSchema, resetTokenSchema } = await import('./password-reset.js');
const { withLoginTarget } = await import('./login-target.js');

const token = 'a'.repeat(43);

describe('resetTokenSchema', () => {
    it('accepts a 43-character base64url token', () => {
        expect(resetTokenSchema.safeParse(`${'Ab-_'.repeat(10)}xyz`).success).toBe(true);
    });

    it('rejects anything else', () => {
        for (const value of ['a'.repeat(42), 'a'.repeat(44), `${'a'.repeat(42)}=`, null, undefined]) {
            expect(resetTokenSchema.safeParse(value).success).toBe(false);
        }
    });
});

describe('forgotPasswordSchema', () => {
    it('trims and accepts an email', () => {
        expect(forgotPasswordSchema.parse({ email: '  someone@example.com ' })).toEqual({ email: 'someone@example.com' });
    });

    it('rejects a missing, malformed or oversized email', () => {
        for (const email of [null, '', 'not-an-email', `${'a'.repeat(250)}@example.com`]) {
            expect(forgotPasswordSchema.safeParse({ email }).success).toBe(false);
        }
    });
});

describe('resetPasswordSchema', () => {
    it('accepts matching passwords of a valid length', () => {
        expect(resetPasswordSchema.safeParse({ token, password: 'long enough', confirmPassword: 'long enough' }).success).toBe(true);
    });

    it('reports a mismatch against confirmPassword', () => {
        const result = resetPasswordSchema.safeParse({ token, password: 'long enough', confirmPassword: 'different!' });
        expect(result.success).toBe(false);
        expect(result.error?.issues.map((issue) => issue.path[0])).toEqual(['confirmPassword']);
    });

    it('rejects a password that is too short or too long', () => {
        for (const password of ['short', 'a'.repeat(1025)]) {
            expect(resetPasswordSchema.safeParse({ token, password, confirmPassword: password }).success).toBe(false);
        }
    });

    it('rejects a malformed token or missing fields', () => {
        expect(resetPasswordSchema.safeParse({ token: 'nope', password: 'long enough', confirmPassword: 'long enough' }).success).toBe(false);
        expect(resetPasswordSchema.safeParse({ token, password: null, confirmPassword: null }).success).toBe(false);
    });
});

describe('withLoginTarget', () => {
    it('carries the target as the query', () => {
        const site = '00000000-0000-4000-8000-000000000000';
        expect(withLoginTarget('/login', { site, host: 'example.com' })).toBe(`/login?site=${site}&host=example.com`);
    });

    it('leaves the path alone without one', () => {
        expect(withLoginTarget('/login', {})).toBe('/login');
    });
});
