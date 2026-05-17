/**
 * End-to-end smoke test for the `useCauslDevtools` / Redux DevTools
 * integration (issue iasbuilt/xldatagrid#107).
 *
 * The unit test at `packages/react/src/__tests__/use-causl-devtools.test.tsx`
 * pins the hook's contract in isolation. This spec adds the real-browser
 * leg: it loads the SPA-integration playground with `?devtools=1`, which
 * activates `useCauslDevtools(model, { name: 'spa-demo', forceInDev: true })`
 * inside the demo. The smoke contract is:
 *
 *   1. The page renders the grid and pivot panel (the hook did not throw
 *      during mount).
 *   2. The pivot updates atomically on a filter click (the hook did not
 *      regress grid behavior — same atomicity the BYO-graph spec asserts).
 *   3. The bridge module (`@causl/devtools-bridge`) is reachable as a
 *      module served by Vite — the dynamic import inside the hook
 *      resolved successfully end-to-end.
 *
 * The Redux DevTools browser extension is NOT installed in the headless
 * Playwright Chromium runner, which is intentional: we are verifying the
 * "extension absent" zero-cost path also doesn't break grid behavior in a
 * real browser. The bridge itself short-circuits in that case; the test
 * suite at `@causl/devtools-bridge` covers the extension-present wire
 * protocol separately.
 */
import { test, expect, type Page } from '@playwright/test';

// Mirror `playwright.config.ts`'s `PLAYGROUND_PORT` resolution so the spec
// follows whichever port Vite was actually told to bind. Other parallel
// worktrees may already own 5173, in which case the developer overrides
// the port via env and the same override flows through here.
const PLAYGROUND_PORT = Number(process.env.PLAYGROUND_PORT ?? 5173);
test.use({ baseURL: `http://localhost:${PLAYGROUND_PORT}` });

const PAGE = '/spa-integration/?devtools=1';

async function metricValue(page: Page, label: string): Promise<string> {
  const labelEl = page.locator(`text=${label}`).first();
  await labelEl.waitFor({ state: 'visible' });
  return await labelEl.locator('..').locator('div').nth(1).innerText();
}

test.describe('issue #107 — useCauslDevtools smoke', () => {
  test('demo renders with ?devtools=1 and the pivot updates atomically', async ({ page }) => {
    // Surface any uncaught page errors so a thrown hook fails the test
    // with a clear signal rather than a downstream selector timeout.
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    await page.goto(PAGE);
    await page.locator('[role="grid"]').first().waitFor({ state: 'visible' });
    await page.locator('text=Pivot').first().waitFor({ state: 'visible' });

    // Initial pivot reflects all 200 rows — proves the hook mounted
    // without breaking the grid/pivot wiring.
    const initial = await metricValue(page, 'Visible');
    expect(parseInt(initial.replace(/\D/g, ''), 10)).toBe(200);

    // Trigger a filter and assert the pivot recomputes — proves the
    // grid's commits still propagate through the shared graph even with
    // the DevTools subscription attached.
    await page.locator('button', { hasText: 'Salary > $100k' }).click();
    await expect(async () => {
      const after = await metricValue(page, 'Visible');
      const n = parseInt(after.replace(/\D/g, ''), 10);
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThan(200);
    }).toPass({ timeout: 5_000 });

    expect(pageErrors, `unexpected pageerror(s): ${pageErrors.map((e) => e.message).join('\n')}`)
      .toEqual([]);
  });

  test('@causl/devtools-bridge is served by Vite (dynamic import resolves)', async ({ page }) => {
    // Watch the network for any request whose URL contains
    // `@causl/devtools-bridge`. Vite serves workspace deps under
    // `/node_modules/.vite/deps/` or directly via `/@id/` / `/@fs/`
    // depending on optimization settings, so we match loosely on the
    // package name segment rather than a single canonical path.
    const bridgeRequests: string[] = [];
    page.on('request', (req) => {
      const url = req.url();
      if (url.includes('devtools-bridge')) bridgeRequests.push(url);
    });

    await page.goto(PAGE);
    await page.locator('[role="grid"]').first().waitFor({ state: 'visible' });
    await page.locator('text=Pivot').first().waitFor({ state: 'visible' });

    // The dynamic import in `useCauslDevtools` fires inside a useEffect,
    // so it may arrive a tick after the grid renders. Poll briefly.
    await expect.poll(() => bridgeRequests.length, { timeout: 5_000 })
      .toBeGreaterThan(0);

    // Sanity: at least one of the matching requests was served (not a
    // 404). Vite returns a 200 with the transformed module for a known
    // workspace dep; a missing dep would surface as a failed fetch.
    const sample = bridgeRequests[0];
    const response = await page.request.get(sample);
    expect(response.status(), `bridge module fetch returned ${response.status()} for ${sample}`)
      .toBeLessThan(400);
  });
});
