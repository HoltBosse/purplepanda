import type { APIContext } from 'astro';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSessionUser = vi.fn();
vi.mock('./index.js', () => ({ getSessionUser: (...args: unknown[]) => getSessionUser(...args) }));

const { requireSuperAdmin } = await import('./super-admin');

function context() {
    const notFound = new Response('not found', { status: 404 });
    return { session: {}, rewrite: vi.fn(async () => notFound), notFound } as unknown as APIContext & { notFound: Response };
}

describe('requireSuperAdmin', () => {
    beforeEach(() => getSessionUser.mockReset());

    it('lets a super admin through', async () => {
        getSessionUser.mockResolvedValue({ id: 'u1', superAdmin: true });
        const ctx = context();
        expect(await requireSuperAdmin(ctx)).toEqual({ user: { id: 'u1', superAdmin: true } });
        expect(ctx.rewrite).not.toHaveBeenCalled();
    });

    it.each([
        ['a site admin who is not a super admin', { id: 'u2', superAdmin: false }],
        ['nobody signed in', undefined],
    ])('answers %s with the admin not-found page', async (_, user) => {
        getSessionUser.mockResolvedValue(user);
        const ctx = context();
        const result = await requireSuperAdmin(ctx);
        expect(result.response).toBe(ctx.notFound);
        expect(ctx.rewrite).toHaveBeenCalledWith('/admin/not-found');
    });
});
