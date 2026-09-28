import type { Config, Data } from '@puckeditor/core';
import { describe, expect, it } from 'vitest';
import { sanitizeHtml } from './sanitize-html.server';
import { sanitizeRichtextData } from './sanitize-richtext';

const config = {
    root: { fields: { intro: { type: 'richtext' } } },
    components: {
        Rich: { fields: { content: { type: 'richtext' }, title: { type: 'text' } }, render: () => null },
        List: {
            fields: { items: { type: 'array', arrayFields: { body: { type: 'richtext' } } } },
            render: () => null,
        },
        Box: { fields: { children: { type: 'slot' } }, render: () => null },
    },
} as unknown as Config;

const evil = '<p>hi<img src="x" onerror="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)">x</a></p>';

function page(content: unknown[], rootProps: Record<string, unknown> = {}): Data {
    return { root: { props: rootProps }, content } as unknown as Data;
}

const propsAt = (data: Data, index = 0) => (data.content[index] as unknown as { props: Record<string, any> }).props;

describe('sanitizeHtml (server)', () => {
    it('strips scripts, event handlers and javascript: URLs but keeps formatting', () => {
        const out = sanitizeHtml(evil);

        expect(out).not.toMatch(/onerror|<script|javascript:/i);
        expect(out).toContain('<p>hi<img src="x">');
    });
});

describe('sanitizeRichtextData', () => {
    it('sanitizes richtext props and leaves other fields alone', () => {
        const result = sanitizeRichtextData(config, page([{ type: 'Rich', props: { id: 'a', content: evil, title: evil } }]), sanitizeHtml);

        expect(propsAt(result).content).not.toMatch(/onerror|<script/);
        expect(propsAt(result).title).toBe(evil);
    });

    it('reaches richtext nested in array fields, slots and the root', () => {
        const result = sanitizeRichtextData(
            config,
            page(
                [
                    {
                        type: 'Box',
                        props: { id: 'b', children: [{ type: 'List', props: { id: 'l', items: [{ body: evil }] } }] },
                    },
                ],
                { intro: evil },
            ),
            sanitizeHtml,
        );

        const list = propsAt(result).children[0].props;
        expect(list.items[0].body).not.toMatch(/onerror|<script/);
        expect((result.root.props as Record<string, string>).intro).not.toMatch(/onerror|<script/);
    });

    it('leaves non-string (tiptap JSON) richtext values untouched', () => {
        const doc = { type: 'doc', content: [] };

        const result = sanitizeRichtextData(config, page([{ type: 'Rich', props: { id: 'a', content: doc } }]), sanitizeHtml);

        expect(propsAt(result).content).toEqual(doc);
    });
});
