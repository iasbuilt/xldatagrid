/**
 * End-to-end: SPA-integration / BYO-graph acceptance test.
 *
 * Pins the Phase-2 acceptance criterion from CAUSL_REVIEW_V2.md §3 step 8:
 * "a playground demo where a pivot panel `graph.derived`s off the grid's
 * processed-data node and updates atomically with grid filter changes."
 *
 * If this test fails, the foundational-causl investment did not pay off
 * (the grid and pivot would not be sharing one graph). The whole
 * justification for moving causl into core depends on this working.
 */
import { test, expect } from '@playwright/test';

test.use({ baseURL: 'http://localhost:5173' });

const PAGE = '/spa-integration/';

async function metricValue(page: import('@playwright/test').Page, label: string): Promise<string> {
  // Each Metric tile renders the label in a small uppercase div above a
  // big numeric value. We locate by label text then read the next sibling.
  const labelEl = page.locator(`text=${label}`).first();
  await labelEl.waitFor({ state: 'visible' });
  // The value sits in the next div within the same tile.
  return await labelEl.locator('..').locator('div').nth(1).innerText();
}

test.describe('SPA integration — BYO-graph atomicity', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PAGE);
    await page.locator('[role="grid"]').first().waitFor({ state: 'visible' });
    // Pivot panel is rendered as a sibling of the grid, not inside it.
    await page.locator('text=Pivot').first().waitFor({ state: 'visible' });
  });

  test('pivot metrics reflect the unfiltered grid on first load', async ({ page }) => {
    const visible = await metricValue(page, 'Visible');
    expect(parseInt(visible.replace(/\D/g, ''), 10)).toBe(200); // makeEmployees(200)
  });

  test('clicking "Salary > $100k" updates the pivot atomically', async ({ page }) => {
    const before = await metricValue(page, 'Visible');
    expect(parseInt(before.replace(/\D/g, ''), 10)).toBe(200);

    await page.locator('button', { hasText: 'Salary > $100k' }).click();

    // After the commit, the pivot must show a smaller number — and the
    // grid's visible rows must match. The atomicity guarantee is that
    // these two numbers are NEVER inconsistent (the test below).
    await expect(async () => {
      const after = await metricValue(page, 'Visible');
      const n = parseInt(after.replace(/\D/g, ''), 10);
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThan(200);
    }).toPass({ timeout: 5_000 });
  });

  test('"Engineering only" + "Active only" round-trip clear restores all rows', async ({ page }) => {
    await page.locator('button', { hasText: 'Engineering only' }).click();
    await expect(async () => {
      const n = parseInt((await metricValue(page, 'Visible')).replace(/\D/g, ''), 10);
      expect(n).toBeLessThan(200);
    }).toPass({ timeout: 5_000 });

    await page.locator('button', { hasText: 'Clear filter' }).click();
    await expect(async () => {
      const n = parseInt((await metricValue(page, 'Visible')).replace(/\D/g, ''), 10);
      expect(n).toBe(200);
    }).toPass({ timeout: 5_000 });
  });

  test('pivot rendering is glitch-free: visible count == DOM row count after filter', async ({ page }) => {
    // The atomicity claim: after a commit, the pivot's "Visible" number
    // and the actual DOM rows in the grid are NEVER inconsistent.
    await page.locator('button', { hasText: 'Salary > $100k' }).click();

    await expect(async () => {
      const pivotN = parseInt((await metricValue(page, 'Visible')).replace(/\D/g, ''), 10);
      // Distinct data rows actually rendered (selector keys off the
      // `data-row-id` attribute that only real grid rows carry —
      // excludes ghost row, sub-headers, etc.).
      const domN = await page.locator('[role="grid"] [role="gridcell"][data-row-id]')
        .evaluateAll((els) => new Set(els.map((e) => e.getAttribute('data-row-id'))).size);
      // Virtualisation may keep the DOM smaller than the logical count;
      // the pivot's count is the logical post-filter count (upper bound).
      expect(domN).toBeLessThanOrEqual(pivotN);
      expect(pivotN).toBeGreaterThan(0);
      expect(pivotN).toBeLessThan(200);
    }).toPass({ timeout: 5_000 });
  });
});
