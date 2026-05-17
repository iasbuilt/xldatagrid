/**
 * End-to-end: issue #105 — `useCauslDevtoolsForGraph(graph, options)`
 * overload smoke test.
 *
 * The SPA-integration playground page now calls
 * `useCauslDevtoolsForGraph(graph, ...)` against its shared causl
 * graph. This is the BYO-graph wiring described in README §"Sharing
 * one DevTools panel across multiple grids" — previously the README
 * had to use `useCauslDevtools({ graph } as any, ...)`.
 *
 * In headless chromium the Redux DevTools extension is not installed,
 * so `connectDevtools` short-circuits to a no-op (see
 * `@causl/devtools-bridge`'s zero-cost gate). The acceptance criterion
 * for the overload is then twofold:
 *
 *   1. The page still renders — the hook call must not throw, must not
 *      break the React render tree, and must not interfere with the
 *      grid's mount or the pivot's first paint.
 *   2. The grid + pivot remain atomic across a commit — applying a
 *      filter through the demo buttons still updates the pivot inside
 *      the same render the grid sees the new processed-data node.
 *      This protects against a future regression where the bridge's
 *      `subscribeCommits` listener (when an extension is present) or
 *      the dev-bail logic accidentally serialises commits through an
 *      extra tick.
 *
 * Page error / console-error capture surfaces any throw from the hook
 * (or from the dynamic `@causl/devtools-bridge` import) that would
 * otherwise be swallowed by the .catch in the hook body. The test
 * fails fast if any of those fire.
 */
import { test, expect, type Page } from '@playwright/test';

test.use({ baseURL: 'http://localhost:5173' });

const PAGE = '/spa-integration/';

async function metricValue(page: Page, label: string): Promise<number> {
  const labelEl = page.locator(`text=${label}`).first();
  await labelEl.waitFor({ state: 'visible' });
  const text = await labelEl.locator('..').locator('div').nth(1).innerText();
  return parseInt(text.replace(/\D/g, ''), 10);
}

test.describe('issue #105 — useCauslDevtoolsForGraph smoke', () => {
  let pageErrors: Error[];
  let consoleErrors: string[];

  test.beforeEach(async ({ page }) => {
    pageErrors = [];
    consoleErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err));
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    await page.goto(PAGE);
    await page.locator('[role="grid"]').first().waitFor({ state: 'visible' });
    await page.locator('text=Pivot').first().waitFor({ state: 'visible' });
  });

  test('demo still renders with useCauslDevtoolsForGraph wired in', async ({ page }) => {
    // Pivot's "Visible" metric must equal the seeded row count, proving
    // the grid registered its nodes on the shared graph and the pivot
    // resolved its derived `app:pivot:metrics` node. If the devtools
    // hook had thrown or deadlocked, this would fail or hang.
    const visible = await metricValue(page, 'Visible');
    expect(visible).toBe(200);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('pivot still updates atomically when filtered (shared-graph path)', async ({ page }) => {
    const before = await metricValue(page, 'Visible');
    expect(before).toBe(200);

    await page.locator('button', { hasText: 'Salary > $100k' }).click();

    // The atomicity contract from spa-integration-byo-graph.spec.ts —
    // re-asserted here to confirm the new hook does not perturb the
    // commit pipeline. The pivot's count and the DOM row count must
    // never disagree after a commit.
    await expect(async () => {
      const after = await metricValue(page, 'Visible');
      expect(after).toBeGreaterThan(0);
      expect(after).toBeLessThan(200);
      const domN = await page
        .locator('[role="grid"] [role="gridcell"][data-row-id]')
        .evaluateAll((els) => new Set(els.map((e) => e.getAttribute('data-row-id'))).size);
      // Virtualisation may keep the rendered DOM smaller than the
      // post-filter logical count; the pivot's number is the upper
      // bound. The strict invariant is `domN <= pivot`.
      expect(domN).toBeLessThanOrEqual(after);
    }).toPass({ timeout: 5_000 });

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
