import type { Config } from '@puckeditor/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { filterConfigByLocation } from '../index';
import Button from './Button';

const config: Config = { components: { Button } };

function renderIn(location: 'page' | 'form') {
    const button = filterConfigByLocation(config, location).components.Button!;
    return {
        fields: Object.keys(button.fields ?? {}),
        html: renderToStaticMarkup(button.render({ children: 'Go', href: '/next' } as any)),
    };
}

describe('Button', () => {
    it('is a link with a Link field outside forms', () => {
        const { fields, html } = renderIn('page');
        expect(fields).toEqual(['children', 'href']);
        expect(html).toBe('<a class="btn btn-primary" href="/next">Go</a>');
    });

    it('is a submit button with no Link field in forms', () => {
        const { fields, html } = renderIn('form');
        expect(fields).toEqual(['children']);
        expect(html).toBe('<button class="btn btn-primary" type="submit">Go</button>');
    });
});
