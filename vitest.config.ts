import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'node:url';

// Use PWD (preserves symlink path) to avoid spaces in resolved real paths.
// esbuild cannot handle spaces in import paths, and the real path on this
// system contains "MacIntosh HD 1". Falling back to __dirname when PWD is
// unavailable keeps the config portable.
const dirname = process.env.PWD ?? (typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url)));

export default defineConfig({
  // Force Vite to use the symlink path as root (real path may contain spaces)
  root: dirname,
  resolve: {
    // Note: Vite does not expose a `symlinks` toggle here. The spaces-in-path
    // workaround is handled entirely by forcing `root` to the PWD (symlink)
    // path above; esbuild's own import handling stays on that path as long as
    // we do not resolve through real paths ourselves.
    alias: {
      '@iasbuilt/datagrid-core': path.resolve(dirname, 'packages/core/src'),
      '@iasbuilt/datagrid-react': path.resolve(dirname, 'packages/react/src'),
      '@iasbuilt/datagrid-extensions': path.resolve(dirname, 'packages/extensions/src'),
      '@iasbuilt/datagrid-mui': path.resolve(dirname, 'packages/mui/src'),
      // idb is a dependency of the core search-index module; it lives in
      // packages/core/node_modules rather than the root node_modules because
      // pnpm hoists only to the workspace root when it appears in root deps.
      // Resolve it explicitly so vitest can find it during test transforms.
      'idb': path.resolve(dirname, 'packages/core/node_modules/idb')
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['packages/**/__tests__/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**'],
      exclude: ['**/__tests__/**', '**/index.ts'],
      thresholds: {
        lines: 80,
        branches: 75,
        functions: 80,
        statements: 80
      }
    },
  }
});
