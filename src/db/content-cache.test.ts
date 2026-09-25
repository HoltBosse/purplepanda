import { describe, expect, it } from 'vitest';
import { requireTenant, runWithTenant, type TenantContext } from '../tenant/context';
import { getSetting, invalidateSettingsCache } from './content-cache';

const tenantA: TenantContext = { id: 'aaaaaaaa-0000-4000-8000-000000000000', name: 'A', isRoot: true };
const tenantB: TenantContext = { id: 'bbbbbbbb-0000-4000-8000-000000000000', name: 'B', isRoot: false };

// What row-level security would hand each tenant back for `select * from settings`.
const settingsByTenant: Record<string, { key: string; value: unknown }[]> = {
    [tenantA.id]: [{ key: 'site_name', value: 'Site A' }],
    [tenantB.id]: [{ key: 'site_name', value: 'Site B' }],
};

let queries = 0;
// Just enough of drizzle for loadSettingsMap(): select().from(settings) as a thenable, answering
// for whichever tenant is in context when it runs. No $client, so there's no LISTEN/NOTIFY.
const fakeDb = {
    select: () => ({
        from: () => ({
            // biome-ignore lint/suspicious/noThenProperty: mimics drizzle's lazy, thenable query builders
            then: (resolve: (rows: unknown) => unknown, reject?: (err: unknown) => unknown) => {
                queries++;
                return Promise.resolve(settingsByTenant[requireTenant().id] ?? []).then(resolve, reject);
            },
        }),
    }),
} as any;

describe('content cache', () => {
    it('keeps a separate settings cache per tenant', async () => {
        expect(await runWithTenant(tenantA, () => getSetting(fakeDb, 'site_name'))).toBe('Site A');
        expect(await runWithTenant(tenantB, () => getSetting(fakeDb, 'site_name'))).toBe('Site B');
        expect(queries).toBe(2);

        // Both are cached now.
        expect(await runWithTenant(tenantA, () => getSetting(fakeDb, 'site_name'))).toBe('Site A');
        expect(await runWithTenant(tenantB, () => getSetting(fakeDb, 'site_name'))).toBe('Site B');
        expect(queries).toBe(2);
    });

    it('invalidates only the current tenant’s cache', async () => {
        const before = queries;
        await runWithTenant(tenantA, () => invalidateSettingsCache(fakeDb));

        await runWithTenant(tenantA, () => getSetting(fakeDb, 'site_name'));
        expect(queries).toBe(before + 1);
        await runWithTenant(tenantB, () => getSetting(fakeDb, 'site_name'));
        expect(queries).toBe(before + 1);
    });

    it('refuses to read outside a tenant', async () => {
        await expect(getSetting(fakeDb, 'site_name')).rejects.toThrow(/no tenant in context/);
    });
});
