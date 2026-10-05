import type { Config, Data } from '@puckeditor/core';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { disabledComponentNames, hideDisabledComponents, optInComponentNames } from './site-components';
import { DISABLED_COMPONENT_MESSAGE, validateContentTree } from './validate-content';

const render = () => createElement('div');

const config: Config = {
    categories: {
        Layout: { components: ['Grid', 'Hero'] },
        Acme: { components: ['Banner'] },
    },
    components: {
        Grid: { render },
        Hero: { optIn: true, render },
        Banner: { optIn: true, render },
    },
};

describe('optInComponentNames', () => {
    it('lists only the components marked optIn', () => {
        expect(optInComponentNames(config)).toEqual(['Hero', 'Banner']);
    });
});

describe('disabledComponentNames', () => {
    it('is every opt-in component the site has not enabled', () => {
        expect(disabledComponentNames(config, ['Hero'])).toEqual(new Set(['Banner']));
    });

    it('ignores enabled names that are not opt-in components of this build', () => {
        expect(disabledComponentNames(config, ['Grid', 'Gone', 'Hero', 'Banner'])).toEqual(new Set());
    });
});

describe('hideDisabledComponents', () => {
    it('keeps disabled components registered but out of every visible category', () => {
        const hidden = hideDisabledComponents(config, new Set(['Hero', 'Banner']));

        expect(Object.keys(hidden.components)).toEqual(['Grid', 'Hero', 'Banner']);
        expect(hidden.categories?.Layout?.components).toEqual(['Grid']);
        // Emptied by the filter, so dropped rather than shown as an empty heading.
        expect(hidden.categories?.Acme).toBeUndefined();
        const parked = Object.values(hidden.categories ?? {}).find((category) => category.visible === false);
        expect(parked?.components).toEqual(['Hero', 'Banner']);
    });

    it('returns the config untouched when nothing is disabled', () => {
        expect(hideDisabledComponents(config, new Set())).toBe(config);
    });
});

describe('validateContentTree with disabledComponents', () => {
    const data: Data = {
        root: { props: {} },
        content: [
            { type: 'Grid', props: { id: 'grid-1' } },
            { type: 'Hero', props: { id: 'hero-1' } },
        ],
    };

    it('flags each instance of a disabled component', () => {
        expect(validateContentTree(config, data, { disabledComponents: new Set(['Hero']) })).toEqual([
            { componentId: 'hero-1', componentType: 'Hero', field: '(component)', message: DISABLED_COMPONENT_MESSAGE },
        ]);
    });

    it('allows content whose components are all enabled', () => {
        expect(validateContentTree(config, data, { disabledComponents: new Set(['Banner']) })).toEqual([]);
    });
});
