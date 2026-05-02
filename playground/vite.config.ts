import { defineConfig } from 'vite';
import { resolve } from 'path';

// Use PWD to preserve symlink path and avoid spaces in resolved real paths
// that break esbuild. Falls back to __dirname for environments without PWD.
const fallbackRoot = resolve(__dirname, '..');
const rootDir = process.env.PWD ?? fallbackRoot;
const pkgDir = (pkg: string) => resolve(rootDir, 'packages', pkg, 'src');

export default defineConfig({
  resolve: {
    // Note: Vite does not expose a `symlinks` toggle in UserConfig.resolve.
    // The spaces-in-path workaround is handled by pointing `rootDir` at the
    // PWD (symlink) path above, so path aliases below stay on that path.
    alias: {
      '@iasbuilt/datagrid-core': pkgDir('core'),
      '@iasbuilt/datagrid-react': pkgDir('react'),
      '@iasbuilt/datagrid-extensions': pkgDir('extensions'),
      '@iasbuilt/datagrid-mui': pkgDir('mui'),
    },
  },
  optimizeDeps: {
    exclude: [
      '@iasbuilt/datagrid-core',
      '@iasbuilt/datagrid-react',
      '@iasbuilt/datagrid-extensions',
      '@iasbuilt/datagrid-mui',
    ],
  },
  server: {
    watch: {
      ignored: ['!**/packages/*/src/**'],
    },
  },
});
