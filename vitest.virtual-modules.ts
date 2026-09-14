import type { Plugin } from 'vite';

// The Astro integration (src/index.ts) injects these virtual modules at build time from the host
// app's own config (Puck config, db, media/document paths). Tests run without Astro, so any
// module importing one is otherwise unloadable. This supplies the same module shape.
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
  // `$client` stands in for the raw pg Pool: content-cache.ts's LISTEN/NOTIFY wiring and
  // rate-limiter-flexible's RateLimiterPostgres both call `.query()`/`.connect()` on it at module
  // load, so it needs to resolve rather than being `undefined`/absent, even though no test
  // exercises real query results through it.
  'virtual:purplepanda/db': `
    const client = {
      query: () => Promise.resolve({ rows: [] }),
      connect: () => Promise.resolve({ query: () => Promise.resolve({ rows: [] }), on: () => {} }),
    };
    export default { $client: client };
  `,
  'virtual:purplepanda/media-path': 'export default "/tmp/purplepanda-test-media";',
  'virtual:purplepanda/document-path': 'export default null;',
  'virtual:purplepanda/plugins': 'export default [];',
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
