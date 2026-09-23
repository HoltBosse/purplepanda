import { resolve } from 'node:path';
import type { Plugin } from 'vite';

// Two modules are environment, not logic: the site's Puck config and the Postgres pool. Tests run
// without a database and shouldn't depend on whatever components the site happens to register, so
// this plugin swaps both for fixed doubles, and supplies the one virtual module the Astro build
// generates (see astro.config.ts) rather than ships as a file.
//
// The Puck double registers two throwaway components so tests can assert *where* content ends up:
//   Block   — renders a leaf marked with its id
//   Wrapper — renders a slot, so a TemplateSlot can be nested inside another component
// Written with React.createElement rather than JSX because this is emitted as plain JS.
const PUCK_CONFIG = `
import { createElement } from 'react';

export default {
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

// `$client` stands in for the raw pg Pool: content-cache.ts's LISTEN/NOTIFY wiring and
// rate-limiter-flexible's RateLimiterPostgres both call `.query()`/`.connect()` on it at module
// load, so it needs to resolve rather than being `undefined`/absent, even though no test exercises
// real query results through it.
const DB_CLIENT = `
const client = {
  query: () => Promise.resolve({ rows: [] }),
  connect: () => Promise.resolve({ query: () => Promise.resolve({ rows: [] }), on: () => {} }),
};
export default { $client: client };
`;

const VIRTUAL_ISLANDS_ID = 'virtual:purplepanda/islands';
const RESOLVED_VIRTUAL_ISLANDS_ID = `\0${VIRTUAL_ISLANDS_ID}`;

const STUBS = new Map<string, string>([
  [resolve('src/puck.config.tsx'), PUCK_CONFIG],
  [resolve('src/db/client.ts'), DB_CLIENT],
]);

export function purplePandaStubModules(): Plugin {
  return {
    name: 'purplepanda-test-stub-modules',
    enforce: 'pre',
    resolveId(id) {
      return id === VIRTUAL_ISLANDS_ID ? RESOLVED_VIRTUAL_ISLANDS_ID : null;
    },
    load(id) {
      if (id === RESOLVED_VIRTUAL_ISLANDS_ID) return 'export default {};';
      return STUBS.get(id.split('?')[0] ?? id) ?? null;
    },
  };
}
