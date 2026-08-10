import type { AstroSession } from 'astro';
import { describe, expect, it, vi } from 'vitest';
import { createFormFlashSession } from './session';

function fakeSession(): AstroSession {
    const store = new Map<string, unknown>();
    return {
        get: vi.fn(async (key: string) => store.get(key)),
        set: vi.fn((key: string, value: unknown) => {
            store.set(key, value);
        }),
        delete: vi.fn(async (key: string) => {
            store.delete(key);
        }),
    } as unknown as AstroSession;
}

describe('createFormFlashSession', () => {
    it('namespaces reads/writes under form:<formId>', async () => {
        const session = fakeSession();
        const flash = createFormFlashSession(session);

        await flash.set('contact', { email: 'bad address' });

        expect(session.set).toHaveBeenCalledWith('form:contact', { email: 'bad address' });
    });

    it('round-trips data set for a given form id', async () => {
        const session = fakeSession();
        const flash = createFormFlashSession(session);

        await flash.set('contact', { email: 'bad address' });
        await expect(flash.get('contact')).resolves.toEqual({ email: 'bad address' });
    });

    it('returns null when nothing has been set for a form id', async () => {
        const session = fakeSession();
        const flash = createFormFlashSession(session);

        await expect(flash.get('contact')).resolves.toBeNull();
    });

    it('keeps different form ids independent', async () => {
        const session = fakeSession();
        const flash = createFormFlashSession(session);

        await flash.set('contact', { email: 'bad' });
        await flash.set('newsletter', { email: 'also bad' });

        await expect(flash.get('contact')).resolves.toEqual({ email: 'bad' });
        await expect(flash.get('newsletter')).resolves.toEqual({ email: 'also bad' });
    });

    it('deletes data for a given form id', async () => {
        const session = fakeSession();
        const flash = createFormFlashSession(session);

        await flash.set('contact', { email: 'bad' });
        await flash.delete('contact');

        await expect(flash.get('contact')).resolves.toBeNull();
    });

    it('treats an undefined session as a no-op store that always reads null', async () => {
        const flash = createFormFlashSession(undefined);

        await expect(flash.get('contact')).resolves.toBeNull();
        await expect(flash.set('contact', { email: 'bad' })).resolves.toBeUndefined();
        await expect(flash.delete('contact')).resolves.toBeUndefined();
    });
});
