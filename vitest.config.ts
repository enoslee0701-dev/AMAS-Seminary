// Vitest config — keeps the test runner separate from the Vite build.
//
// `environment: 'happy-dom'` gives us a lightweight DOM so modules that touch
// browser globals (atob/btoa, fetch, etc.) just work without per-test wiring.
//
// `include` is scoped to `tests/**` so Vite's production build doesn't pick
// these files up, and so component sources never accidentally execute as
// tests when `vitest` walks the tree.

import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  define: {
    // Force `import.meta.env.VITE_API_BASE_URL` references in SUT code to
    // resolve to a runtime lookup against globalThis, so individual tests
    // can override the value via globalThis.__TEST_VITE_API_BASE_URL.
    'import.meta.env.VITE_API_BASE_URL': '(globalThis.__TEST_VITE_API_BASE_URL ?? "")',
  },
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    globals: false,
  },
});
