import type { Config } from '@puckeditor/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { filterConfigByLocation } from '../index';
import Button from './Button';

const config: Config = { components: { Button } };

const file = {
    id: 'img-1',
    title: 'Arrow',
    alt: 'Arrow',
    width: null,
    height: null,
    objectPosition: null,
    crop: null,
};

function renderIn(location: 'page' | 'form', props: Record<string, unknown> = {}) {
    const button = filterConfigByLocation(config, location).components.Button!;
    return {
        fields: Object.keys(button.fields ?? {}),
        html: renderToStaticMarkup(button.render({ children: 'Go', href: '/next', ...props } as any)),
    };
}

describe('Button', () => {
    it('is a link with a Link field outside forms', () => {
        const { fields, html } = renderIn('page');
        expect(fields).toEqual(['children', 'href', 'image']);
        expect(html).toBe('<a class="btn btn-primary" href="/next">Go</a>');
    });

    it('is a submit button with no Link field in forms', () => {
        const { fields, html } = renderIn('form');
        expect(fields).toEqual(['children', 'image']);
        expect(html).toBe('<button class="btn btn-primary" type="submit">Go</button>');
    });

    it('lays an image out beside the label', () => {
        const { html } = renderIn('page', { image: { file, position: 'end', gap: 2 } });
        expect(html).toContain('flex-direction:row-reverse');
        expect(html).toContain('gap:0.5rem');
        expect(html).toContain('src="/image/img-1?fmt=png"');
        expect(html).toContain('<span>Go</span>');
    });

    it('renders just the label when the image group has no file', () => {
        const { html } = renderIn('form', { image: { file: null, position: 'end', gap: 2 } });
        expect(html).toBe('<button class="btn btn-primary" type="submit">Go</button>');
    });
});
