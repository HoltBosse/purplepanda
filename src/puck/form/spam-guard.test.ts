import { describe, expect, it } from 'vitest';
import {
    CSRF_FIELD_NAME,
    HONEYPOT_FIELD_NAMES,
    isHoneypotTripped,
    isSubmittedTooFast,
    renderSpamGuardFieldsHtml,
    stripSpamGuardFields,
} from './spam-guard';

const CSRF_TTL_MS = 2 * 60 * 60 * 1000;

/** Builds a token in the same shape `decodeCsrfToken` expects, without needing a real secret. */
function buildToken(formId: string, issuedAt: number, signature = 'sig') {
    const expires = issuedAt + CSRF_TTL_MS;
    const payload = `${formId}:${expires}:nonce`;
    const encodedPayload = Buffer.from(payload, 'utf-8').toString('base64url');
    return `${encodedPayload}.${signature}`;
}

describe('isHoneypotTripped', () => {
    it('returns false when honeypot fields are absent', () => {
        expect(isHoneypotTripped({})).toBe(false);
    });

    it('returns false when honeypot fields are empty or whitespace', () => {
        expect(isHoneypotTripped({ [HONEYPOT_FIELD_NAMES[0]]: '' })).toBe(false);
        expect(isHoneypotTripped({ [HONEYPOT_FIELD_NAMES[0]]: '   ' })).toBe(false);
    });

    it('returns true when any honeypot field has a non-blank value', () => {
        expect(isHoneypotTripped({ [HONEYPOT_FIELD_NAMES[0]]: 'i am a bot' })).toBe(true);
        expect(isHoneypotTripped({ [HONEYPOT_FIELD_NAMES[1]]: 'bot@example.com' })).toBe(true);
    });

    it('ignores non-string values in honeypot fields', () => {
        expect(isHoneypotTripped({ [HONEYPOT_FIELD_NAMES[0]]: 42 })).toBe(false);
    });
});

describe('stripSpamGuardFields', () => {
    it('removes the CSRF field and all honeypot fields, leaving other data intact', () => {
        const data: Record<string, unknown> = {
            [CSRF_FIELD_NAME]: 'token',
            [HONEYPOT_FIELD_NAMES[0]]: '',
            [HONEYPOT_FIELD_NAMES[1]]: '',
            name: 'Jane',
        };
        stripSpamGuardFields(data);
        expect(data).toEqual({ name: 'Jane' });
    });

    it('is a no-op when guard fields are absent', () => {
        const data: Record<string, unknown> = { name: 'Jane' };
        stripSpamGuardFields(data);
        expect(data).toEqual({ name: 'Jane' });
    });
});

describe('isSubmittedTooFast', () => {
    it('returns true when the token was issued less than the minimum fill time ago', () => {
        const token = buildToken('contact', Date.now());
        expect(isSubmittedTooFast('contact', token)).toBe(true);
    });

    it('returns false once enough time has passed since issuance', () => {
        const token = buildToken('contact', Date.now() - 5000);
        expect(isSubmittedTooFast('contact', token)).toBe(false);
    });

    it('returns false when the token was issued for a different form', () => {
        const token = buildToken('other-form', Date.now());
        expect(isSubmittedTooFast('contact', token)).toBe(false);
    });

    it('returns false for a missing or non-string token', () => {
        expect(isSubmittedTooFast('contact', undefined)).toBe(false);
        expect(isSubmittedTooFast('contact', 42)).toBe(false);
    });

    it('returns false for a malformed token', () => {
        expect(isSubmittedTooFast('contact', 'not-a-real-token')).toBe(false);
        expect(isSubmittedTooFast('contact', 'onlyonepart')).toBe(false);
        expect(isSubmittedTooFast('contact', '!!!notbase64!!!.sig')).toBe(false);
    });
});

describe('renderSpamGuardFieldsHtml', () => {
    it('renders a hidden CSRF input carrying the given token', () => {
        const html = renderSpamGuardFieldsHtml('my-token');
        expect(html).toContain(`name="${CSRF_FIELD_NAME}"`);
        expect(html).toContain('value="my-token"');
        expect(html).toContain('type="hidden"');
    });

    it('renders an off-screen text input for each honeypot field name', () => {
        const html = renderSpamGuardFieldsHtml('my-token');
        for (const name of HONEYPOT_FIELD_NAMES) {
            expect(html).toContain(`name="${name}"`);
        }
        expect(html.match(/type="text"/g)).toHaveLength(HONEYPOT_FIELD_NAMES.length);
    });

    it('keeps honeypot inputs out of tab order and hidden from screen readers', () => {
        const html = renderSpamGuardFieldsHtml('my-token');
        expect(html).toContain('tabindex="-1"');
        expect(html).toContain('aria-hidden="true"');
    });
});
