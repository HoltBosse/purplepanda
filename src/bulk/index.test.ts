import type { APIContext } from 'astro';
import type { PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
import { createBulkHandler } from './index';

const fakeTable = {} as PgTable & { id: any; state: any };

function fakeContext(action: string, selected: string[]): APIContext {
    const formData = new FormData();
    for (const id of selected) formData.append('selected[]', id);

    return {
        params: { action },
        request: { formData: async () => formData } as unknown as Request,
        rewrite: vi.fn(async (path: string) => new Response(null, { status: 200, headers: { 'x-rewrite-to': path } })),
        redirect: vi.fn((path: string) => new Response(null, { status: 302, headers: { Location: path } })),
    } as unknown as APIContext;
}

describe('createBulkHandler', () => {
    it('rewrites to the 404 page for an unrecognized action', async () => {
        const handler = createBulkHandler(fakeTable, '/admin/things');
        const context = fakeContext('nuke', ['00000000-0000-0000-0000-000000000000']);

        const response = await handler(context);

        expect(context.rewrite).toHaveBeenCalledWith('/admin/404');
        expect(response.headers.get('x-rewrite-to')).toBe('/admin/404');
    });

    it('rejects with 400 when no ids are selected', async () => {
        const handler = createBulkHandler(fakeTable, '/admin/things');
        const context = fakeContext('publish', []);

        const response = await handler(context);

        expect(response.status).toBe(400);
    });

    it('rejects with 400 when a selected id is not a valid uuid', async () => {
        const handler = createBulkHandler(fakeTable, '/admin/things');
        const context = fakeContext('publish', ['not-a-uuid']);

        const response = await handler(context);

        expect(response.status).toBe(400);
    });

    it.each(['publish', 'unpublish', 'delete'])('recognizes %s as a valid action', async (action) => {
        const handler = createBulkHandler(fakeTable, '/admin/things');
        const context = fakeContext(action, []);

        await handler(context);

        // Reaches id validation (and 400s there) rather than rewriting to 404, proving the
        // action itself was accepted.
        expect(context.rewrite).not.toHaveBeenCalled();
    });
});
