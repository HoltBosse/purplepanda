import { describe, expect, it } from 'vitest';
import { dnsInstructionsFor, MOVE_TO_CLOUDFLARE } from './dns-records';

const target = '0b6c4c8e-5d3a-4e8f-9a51-2f6a3c1d7e90.hosting.example.net';

describe('dnsInstructionsFor', () => {
    it('gives a subdomain a CNAME named for its labels under the registrable domain', () => {
        expect(dnsInstructionsFor('www.example.co.uk', 'namecheap', target)).toMatchObject({
            kind: 'subdomain',
            records: [{ type: 'CNAME', name: 'www', value: target }],
        });
        expect(dnsInstructionsFor('a.b.example.com', 'cloudflare', target).records[0]!.name).toBe('a.b');
    });

    it('uses the provider’s apex alias record and name', () => {
        expect(dnsInstructionsFor('example.com', 'cloudflare', target).records).toEqual([{ type: 'CNAME', name: '@', value: target }]);
        expect(dnsInstructionsFor('example.co.uk', 'porkbun', target).records).toEqual([{ type: 'ALIAS', name: '', value: target }]);
        expect(dnsInstructionsFor('example.com', 'dnsmadeeasy', target).records).toEqual([{ type: 'ANAME', name: '', value: target }]);
    });

    it('sends an apex whose provider can’t alias it to Cloudflare, never to an address', () => {
        const instructions = dnsInstructionsFor('example.com', 'godaddy', target);
        expect(instructions.records).toEqual([]);
        expect(instructions.note).toContain(MOVE_TO_CLOUDFLARE);
    });

    it('lists every apex stand-in for a CNAME for another provider', () => {
        const instructions = dnsInstructionsFor('example.com', 'other', target);
        expect(instructions.alternatives).toBe(true);
        expect(instructions.records.map((record) => record.type)).toEqual(['CNAME', 'ALIAS', 'ANAME']);
        expect(instructions.note).toContain(MOVE_TO_CLOUDFLARE);
    });

    it('has nothing to set up for localhost or an IP address', () => {
        expect(dnsInstructionsFor('localhost', 'cloudflare', target).kind).toBe('none');
        expect(dnsInstructionsFor('127.0.0.1', 'cloudflare', target).kind).toBe('none');
    });
});
