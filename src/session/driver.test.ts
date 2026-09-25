import { stringify } from 'devalue';
import { describe, expect, it } from 'vitest';
import { describe as describeSession } from './driver';

const USER = '11111111-1111-4111-8111-111111111111';
const TENANT = '22222222-2222-4222-8222-222222222222';
const LOGIN = '33333333-3333-4333-8333-333333333333';

// Astro's own on-disk shape: a devalue-serialized Map of key -> { data, expires? }.
function serialize(entries: Record<string, { data: unknown; expires?: number }>): string {
    return stringify(new Map(Object.entries(entries)));
}

describe('session driver describe()', () => {
    it('derives the signed-in user, tenant and sign-in', () => {
        expect(describeSession(serialize({ userId: { data: USER }, tenantId: { data: TENANT }, loginId: { data: LOGIN } }))).toEqual({
            userId: USER,
            tenantId: TENANT,
            loginId: LOGIN,
            expiresAt: null,
        });
    });

    it('leaves the tenant and sign-in null for an anonymous session', () => {
        const columns = describeSession(serialize({ alerts: { data: [] } }));
        expect(columns.userId).toBeNull();
        expect(columns.tenantId).toBeNull();
        expect(columns.loginId).toBeNull();
    });

    it('ignores an expired or non-uuid tenant entry', () => {
        expect(describeSession(serialize({ tenantId: { data: TENANT, expires: Date.now() - 1000 } })).tenantId).toBeNull();
        expect(describeSession(serialize({ tenantId: { data: 'not-a-uuid' } })).tenantId).toBeNull();
    });

    it('treats unparseable data as an empty session', () => {
        expect(describeSession('not devalue')).toEqual({ userId: null, tenantId: null, loginId: null, expiresAt: null });
    });
});
