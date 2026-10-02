import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    getDocumentStorage,
    getMediaStorage,
    getStorageDriver,
    logStorageBanner,
    resetStorage,
    storageKey,
} from './index.js';

const ID = '0123abcd-0000-4000-8000-000000000000';
const ENV_KEYS = ['STORAGE_DRIVER', 'MEDIA_PATH', 'DOCUMENT_PATH', 'S3_BUCKET', 'S3_ENDPOINT', 'S3_PREFIX'];

describe('storage', () => {
    afterEach(() => {
        for (const key of ENV_KEYS) delete process.env[key];
        resetStorage();
        vi.restoreAllMocks();
    });

    it('keys files by their id, split two levels deep', () => {
        expect(storageKey(ID)).toBe(`01/23/${ID}`);
    });

    it('defaults to the filesystem driver', () => {
        expect(getStorageDriver()).toBe('filesystem');
    });

    it('rejects an unknown driver', () => {
        process.env.STORAGE_DRIVER = 'floppy';
        expect(() => getStorageDriver()).toThrow(/Unknown STORAGE_DRIVER/);
    });

    it('writes to MEDIA_PATH / DOCUMENT_PATH on the filesystem driver', async () => {
        const root = await mkdtemp(join(tmpdir(), 'pp-storage-'));
        try {
            process.env.MEDIA_PATH = join(root, 'media');
            process.env.DOCUMENT_PATH = join(root, 'documents');

            await getMediaStorage().write(storageKey(ID), Buffer.from('image'));
            await getDocumentStorage().write(storageKey(ID), Buffer.from('document'));

            expect(await readFile(join(root, 'media', '01', '23', ID), 'utf8')).toBe('image');
            expect(await readFile(join(root, 'documents', '01', '23', ID), 'utf8')).toBe('document');
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    });

    it('keeps media and documents apart on the memory driver, and shares one store per process', async () => {
        process.env.STORAGE_DRIVER = 'memory';

        await getMediaStorage().write(storageKey(ID), Buffer.from('image'));

        expect((await getMediaStorage().readToBuffer(storageKey(ID))).toString()).toBe('image');
        expect(await getDocumentStorage().fileExists(storageKey(ID))).toBe(false);
    });

    it('requires S3_BUCKET on the s3 driver', () => {
        process.env.STORAGE_DRIVER = 's3';
        expect(() => getMediaStorage()).toThrow(/S3_BUCKET/);
    });

    it('warns loudly at startup on the memory driver', () => {
        process.env.STORAGE_DRIVER = 'memory';
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        logStorageBanner();

        expect(warn).toHaveBeenCalledOnce();
        expect(warn.mock.calls[0]![0]).toMatch(/KEPT IN MEMORY ONLY/);
    });

    it('just reports the driver otherwise', () => {
        process.env.STORAGE_DRIVER = 's3';
        process.env.S3_BUCKET = 'uploads';
        process.env.S3_ENDPOINT = 'http://localhost:9000';
        const info = vi.spyOn(console, 'info').mockImplementation(() => {});
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        logStorageBanner();

        expect(warn).not.toHaveBeenCalled();
        expect(info.mock.calls[0]![0]).toContain('bucket "uploads"');
    });
});
