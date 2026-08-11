import type { Plugin } from 'vite';

// The Astro integration (src/index.ts) injects these virtual modules at build time from the host
// app's own Puck config. Browser tests run without Astro, so any component importing one is
// otherwise unloadable. This supplies the same module shape.
//
// `puck-config` registers two throwaway components so tests can assert *where* content ends up:
//   Block   — renders a leaf marked with its id
//   Wrapper — renders a slot, so a TemplateSlot can be nested inside another component
// Written with React.createElement rather than JSX because this is emitted as plain JS.
const PUCK_CONFIG = `
import { createElement } from 'react';

export default {
  contentTypes: [],
  fontFamilies: [],
  components: {
    Block: {
      fields: {},
      defaultProps: {},
      render: ({ id }) => createElement('div', { 'data-block': id }, id),
    },
    Wrapper: {
      fields: { content: { type: 'slot' } },
      defaultProps: { content: [] },
      render: ({ id, content: Content }) =>
        createElement('div', { 'data-wrapper': id }, createElement(Content)),
    },
  },
};
`;

const MODULES: Record<string, string> = {
  'virtual:purplepanda/puck-config': PUCK_CONFIG,
  'virtual:purplepanda/has-404': 'export const has404Page = false;',
  'virtual:purplepanda/islands': 'export default {};',
};

export function purplePandaVirtualModules(): Plugin {
  return {
    name: 'purplepanda-test-virtual-modules',
    resolveId(id) {
      return id in MODULES ? `\0${id}` : null;
    },
    load(id) {
      const bare = id.startsWith('\0') ? id.slice(1) : id;
      return MODULES[bare] ?? null;
    },
  };
}
