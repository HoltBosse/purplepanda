import { describe, expect, it } from 'vitest';
import { getTenant, requireTenant, runWithTenant, type TenantContext } from './context';

const tenantA: TenantContext = { id: '00000000-0000-0000-0000-00000000000a', name: 'A', isRoot: true };
const tenantB: TenantContext = { id: '00000000-0000-0000-0000-00000000000b', name: 'B', isRoot: false };

// Stands in for a drizzle query builder: nothing runs until something calls then().
function lazyQuery(): PromiseLike<TenantContext | undefined> {
    return {
        // biome-ignore lint/suspicious/noThenProperty: the whole point is to mimic a lazy thenable
        then(resolve, reject) {
            return Promise.resolve(getTenant()).then(resolve, reject);
        },
    };
}

describe('tenant context', () => {
    it('has no tenant outside runWithTenant', () => {
        expect(getTenant()).toBeUndefined();
        expect(() => requireTenant()).toThrow(/no tenant in context/);
    });

    it('carries the tenant across awaits', async () => {
        const seen = await runWithTenant(tenantA, async () => {
            await Promise.resolve();
            return requireTenant();
        });
        expect(seen).toBe(tenantA);
    });

    it('runs a lazy thenable inside the tenant it was started for, not the caller’s', async () => {
        const seen = await runWithTenant(tenantA, () => runWithTenant(tenantB, () => lazyQuery()));
        expect(seen).toBe(tenantB);
    });

    it('restores the outer tenant after a nested one', async () => {
        const seen = await runWithTenant(tenantA, async () => {
            await runWithTenant(tenantB, async () => {});
            return getTenant();
        });
        expect(seen).toBe(tenantA);
    });
});
