import type { StorybookConfig } from '@storybook/react-vite';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

// Use PWD to preserve symlink path and avoid spaces in resolved real paths
// that break esbuild. Falls back to import.meta dirname for portability.
const fallbackDir = dirname(fileURLToPath(import.meta.url));
const rootDir = process.env.PWD ?? resolve(fallbackDir, '..');
const pkgDir = (pkg: string) => resolve(rootDir, 'packages', pkg, 'src');

const config: StorybookConfig = {
  stories: [
    '../stories/**/*.mdx',
    '../stories/**/*.stories.@(js|jsx|mjs|ts|tsx)',
  ],
  addons: [
    '@storybook/addon-docs',
    '@storybook/addon-a11y',
  ],
  framework: '@storybook/react-vite',
  viteFinal: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.symlinks = false;
    config.resolve.alias = {
      ...config.resolve.alias,
      '@iasbuilt/datagrid-core': pkgDir('core'),
      '@iasbuilt/datagrid-react': pkgDir('react'),
      '@iasbuilt/datagrid-extensions': pkgDir('extensions'),
      '@iasbuilt/datagrid-mui': pkgDir('mui'),
    };
    // Enable HMR for package source files
    config.server = config.server ?? {};
    config.server.watch = {
      ...config.server.watch,
      // Watch the package source directories for changes
      ignored: ['!**/packages/*/src/**'],
    };
    config.optimizeDeps = {
      ...config.optimizeDeps,
      // Exclude workspace packages so Vite processes them as source
      exclude: [
        ...(config.optimizeDeps?.exclude ?? []),
        '@iasbuilt/datagrid-core',
        '@iasbuilt/datagrid-react',
        '@iasbuilt/datagrid-extensions',
        '@iasbuilt/datagrid-mui',
      ],
    };
    return config;
  },
};
export default config;
