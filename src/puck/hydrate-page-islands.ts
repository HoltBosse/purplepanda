// Client entry for pages that render PageRenderer as static HTML (the published page and the draft
// preview routes). Components flagged `island: true` render a `[data-puck-island]` marker around
// their output (see ./islands.tsx); this hydrates each marker into an interactive React root using
// the same component's `render`.
//
// Pages that embed PageRenderer inside a live React tree (e.g. HistoryView, client:load) simply
// don't load this script — hydrating their markers independently would double-mount.
//
// Everything below is dynamically imported so nothing React-shaped is evaluated before the Fast
// Refresh stubs are in place, and so a page with no markers pays for none of it.
const globals = window as unknown as {
  $RefreshReg$?: () => void;
  $RefreshSig$?: () => (type: unknown) => unknown;
  __vite_plugin_react_preamble_installed__?: boolean;
};

// In dev, @astrojs/react instruments component modules with React Fast Refresh globals
// ($RefreshReg$/$RefreshSig$). Astro only defines those on pages that host a client:* React island;
// these pages have none, so importing the components below would throw "$RefreshSig$ is not
// defined". Islands here don't need HMR, so no-op stubs are enough. In production these globals
// aren't emitted at all, making this a harmless no-op.
globals.$RefreshReg$ ||= () => {};
globals.$RefreshSig$ ||= () => (type: unknown) => type;
globals.__vite_plugin_react_preamble_installed__ = true;

import("./hydrate-islands.js").then(({ hydrateIslands }) => hydrateIslands(document));
