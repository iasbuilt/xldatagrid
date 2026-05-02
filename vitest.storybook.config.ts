import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';

// Use PWD (preserves symlink path) to avoid spaces in resolved real paths.
const dirname = process.env.PWD ?? (typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url)));

// Storybook visual tests — runs stories in a headless Playwright browser.
// Usage: npx vitest run --config vitest.storybook.config.ts
export default defineConfig({
  root: dirname,
  resolve: {
    // Note: Vite does not expose a `symlinks` toggle here; rely on `root`
    // being the PWD (symlink) path to keep the workaround for spaces-in-path.
    alias: {
      '@iasbuilt/datagrid-core': path.resolve(dirname, 'packages/core/src'),
      '@iasbuilt/datagrid-react': path.resolve(dirname, 'packages/react/src'),
      '@iasbuilt/datagrid-extensions': path.resolve(dirname, 'packages/extensions/src'),
      '@iasbuilt/datagrid-mui': path.resolve(dirname, 'packages/mui/src')
    }
  },
  plugins: [
    storybookTest({
      configDir: path.join(dirname, '.storybook'),
    }),
  ],
  test: {
    name: 'storybook',
    browser: {
      enabled: true,
      headless: true,
      provider: 'playwright',
      instances: [{
        browser: 'chromium'
      }]
    }
  }
});
