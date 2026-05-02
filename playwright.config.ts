/**
 * Playwright configuration for the `@iasbuilt/datagrid-monorepo` end-to-end
 * suite. Specs live under `e2e/` and drive a real browser against the
 * Storybook instance that renders the grid packages.
 *
 * CI note: the `webServer` stanza tells Playwright to boot Storybook on port
 * 6006 before the test run begins, so GitHub Actions does not need to pre-
 * start a server. The server is reused locally when it is already running
 * (typical developer workflow: `pnpm run storybook` in a separate terminal).
 */
import { defineConfig, devices } from '@playwright/test';

const STORYBOOK_PORT = Number(process.env.STORYBOOK_PORT ?? 6006);
const STORYBOOK_URL = `http://localhost:${STORYBOOK_PORT}`;

export default defineConfig({
  testDir: './e2e',
  // Parallelism policy:
  //   - CI:    1 worker, no in-file parallelism — GitHub runners have ~2
  //            cores and shared Storybook iframe state is easier to debug
  //            when runs are deterministic.
  //   - Local: half of the available CPUs (Playwright's default heuristic)
  //            parallelising ACROSS files, but NOT within a file. Within-
  //            file serialisation keeps per-describe setup (e.g. theme
  //            toggles, story navigations) from racing each other.
  //   Override either side with `PLAYWRIGHT_WORKERS=<n>` or
  //   `PLAYWRIGHT_FULLY_PARALLEL=1` when iterating.
  fullyParallel: process.env.PLAYWRIGHT_FULLY_PARALLEL === '1',
  workers: process.env.PLAYWRIGHT_WORKERS
    ? Number(process.env.PLAYWRIGHT_WORKERS)
    : process.env.CI
      ? 1
      : undefined,
  retries: process.env.CI ? 2 : 0,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['list']]
    : [['list']],
  timeout: 30_000,
  expect: {
    timeout: 7_500,
  },
  use: {
    baseURL: STORYBOOK_URL,
    headless: true,
    actionTimeout: 7_500,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // `storybook dev` is fast enough for E2E and supports HMR; the static
    // build path is available via `pnpm build-storybook && pnpm exec http-server`
    // for anyone who needs to profile without Vite in the loop.
    command: `pnpm exec storybook dev --ci --port ${STORYBOOK_PORT} --quiet`,
    url: STORYBOOK_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
