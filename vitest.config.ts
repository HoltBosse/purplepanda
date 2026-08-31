/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { playwright } from '@vitest/browser-playwright';
import { getViteConfig } from 'astro/config';
import { purplePandaVirtualModules } from './vitest.virtual-modules.js';

const commonExclude = ['dist/**', 'node_modules/**', 'docs/**'];
const browserTests = 'src/**/*.browser.test.tsx';

// Chromium is launched without DISPLAY on purpose. When a display is forwarded into this
// container (VS Code remote / WSL sets DISPLAY=:50), even a headless Chromium reaches for that X
// server during startup and never finishes booting Vitest's tester — the runtime loads, the
// websocket connects, and then `createTesters` hangs until the session times out. Dropping the
// variable for the browser process alone keeps a forwarded display usable for everything else.
const { DISPLAY: _display, ...envWithoutDisplay } = process.env;

// lucide-react is consumed through deep per-icon paths, which Vite only discovers once a
// component using one is imported — i.e. mid test run. That discovery triggers a re-optimize and
// a page reload, which kills the runner while a test file is still importing ("Vitest failed to
// find the runner"). Listing them (with the other late-discovered deps below) keeps the optimizer
// settled before the first test loads. Only bites on a cold cache — i.e. exactly the first CI run.
const lucideIconEntries = [
  'calendar-clock',
  'chevron-down',
  'circle-check-big',
  'circle-x',
  'info',
  'link',
  'monitor',
  'save',
  'smartphone',
  'subscript',
  'superscript',
  'tablet',
  'triangle-alert',
].map((icon) => `lucide-react/dist/esm/icons/${icon}.mjs`);

export default getViteConfig({
  test: {
    exclude: commonExclude,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          exclude: [...commonExclude, browserTests],
        },
      },
      // React component tests run in a real Chromium via Vitest Browser Mode, independent of the
      // Astro-derived config above: Astro's Vite plugin wires up its own dev server, which assumes
      // it is being driven by the Astro CLI and breaks the server Browser Mode needs to host the
      // tester page. `@vitejs/plugin-react` covers the JSX these tests need, and the virtual
      // modules Astro would otherwise inject are supplied by the plugin below.
      {
        plugins: [react(), purplePandaVirtualModules()],
        // Without this a dependency that bundles its own React (e.g. @videojs/react) gets a
        // second copy, and any hook it calls reads a null dispatcher — surfacing as
        // "Cannot read properties of null (reading 'useState')" the moment such a component
        // renders.
        resolve: { dedupe: ['react', 'react-dom'] },
        // See lucideIconEntries above for why these are pinned.
        optimizeDeps: {
          include: [
            'vitest-browser-react',
            'zod',
            '@tiptap/extensions',
            '@tiptap/extension-subscript',
            '@tiptap/extension-superscript',
            ...lucideIconEntries,
          ],
        },
        test: {
          name: 'browser',
          include: [browserTests],
          exclude: commonExclude,
          browser: {
            enabled: true,
            // Both of these default to `!process.env.CI`, i.e. they silently flip to headed/UI
            // mode on a developer machine. Pinned so a local run matches CI.
            headless: true,
            ui: false,
            provider: playwright({
              launchOptions: { env: envWithoutDisplay as Record<string, string> },
            }),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
