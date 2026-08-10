import { describe, expect, it } from 'vitest';
import { hash, verify } from './index';

describe('hash', () => {
    it('produces a PHC-formatted scrypt string', async () => {
        const hashed = await hash('correct horse battery staple');
        expect(hashed).toMatch(/^\$scrypt\$ln=17,r=8,p=1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
    });

    it('produces a different hash each time due to random salt', async () => {
        const [a, b] = await Promise.all([hash('same-password'), hash('same-password')]);
        expect(a).not.toBe(b);
    });
});

describe('verify', () => {
    it('accepts the correct password', async () => {
        const hashed = await hash('correct horse battery staple');
        await expect(verify('correct horse battery staple', hashed)).resolves.toBe(true);
    });

    it('rejects an incorrect password', async () => {
        const hashed = await hash('correct horse battery staple');
        await expect(verify('wrong password', hashed)).resolves.toBe(false);
    });

    it('rejects a hash with the wrong number of segments', async () => {
        await expect(verify('anything', '$scrypt$ln=17,r=8,p=1$onlyfoursegments')).resolves.toBe(false);
    });

    it('rejects a hash that does not start with an empty leading segment', async () => {
        await expect(verify('anything', 'scrypt$ln=17,r=8,p=1$salt$key$extra')).resolves.toBe(false);
    });

    it('rejects a hash with an unrecognized algorithm', async () => {
        await expect(verify('anything', '$argon2id$ln=17,r=8,p=1$salt$key')).resolves.toBe(false);
    });

    it('rejects a hash with non-numeric params', async () => {
        await expect(verify('anything', '$scrypt$ln=x,r=8,p=1$salt$key')).resolves.toBe(false);
    });

    it('rejects an empty string', async () => {
        await expect(verify('anything', '')).resolves.toBe(false);
    });
});
