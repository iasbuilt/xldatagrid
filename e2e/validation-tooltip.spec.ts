/**
 * End-to-end: validation tooltip overlay rendered as a portal, NOT inline.
 *
 * Contracts guarded by this file (ALL expected to fail today — the new
 * subsystem is not yet implemented; the legacy story still renders a
 * custom overlay component and inline cell errors):
 *
 *   1.  After triggering an invalid value, a DOM node matching
 *       `[role="tooltip"][data-validation-target="<rowId>:<field>"]`
 *       exists in the page. The target attribute is load-bearing: it wires
 *       the tooltip back to the cell it annotates.
 *
 *   2.  The tooltip's computed background colour matches the severity
 *       token — error → red, warning → yellow. We probe the computed
 *       style on the portal node so we are asserting against whatever
 *       design token resolves at runtime, not a hard-coded hex.
 *
 *   3.  The tooltip contains a severity icon tagged
 *       `[data-icon="error"]` (or `data-icon="warning"` / `data-icon="info"`).
 *
 *   4.  For a cell attached to two validators (1 error + 1 warning), the
 *       tooltip lists BOTH messages and the error message appears first
 *       in the DOM order.
 *
 *   5.  The cell itself does NOT contain an inline `[role="alert"]`
 *       validation message — messaging lives in the portal.
 *
 * Story: `examples-validation-tooltip--default` (see
 * `stories/ValidationTooltip.stories.tsx`). The story exposes a cell with
 * two validators (error + warning) so contract #4 is exercised.
 *
 * This file must FAIL today.
 */
import { test, expect, type Page } from '@playwright/test';

const STORY_URL =
  '/iframe.html?viewMode=story&id=examples-validation-tooltip--default';

async function waitForGrid(page: Page): Promise<void> {
  // Storybook in `--ci` mode lazy-compiles stories on first navigation, so
  // the first hit to a given iframe URL can take noticeably longer than the
  // default 7.5s expect timeout. Give the grid a generous 30s window so the
  // suite is not flaky when run in isolation against a cold Storybook.
  await page
    .locator('[role="grid"]')
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 });
}

// RGB parser: getComputedStyle emits colours as `rgb(r, g, b)` or
// `rgba(r, g, b, a)`. We return the numeric triple so hue-family checks
// (red vs yellow) do not have to care about hex/token resolution.
function parseRgb(s: string): [number, number, number] | null {
  const m = s.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

// "Red family" — dominant red channel. Matches typical error-token palettes
// (e.g. `#ef4444` → rgb(239, 68, 68); `#dc2626` → rgb(220, 38, 38)).
function isRedFamily([r, g, b]: [number, number, number]): boolean {
  return r > 180 && r > g + 40 && r > b + 40;
}

// "Yellow family" — red and green both high, blue low. Matches typical
// warning-token palettes (e.g. `#facc15` → rgb(250, 204, 21); `#fbbf24` →
// rgb(251, 191, 36); `#eab308` → rgb(234, 179, 8)).
function isYellowFamily([r, g, b]: [number, number, number]): boolean {
  return r > 180 && g > 140 && b < 120;
}

/**
 * Edit the cell at (rowId, field) and commit a new value via Enter. Mirrors
 * the grid's inline-edit activation (dblclick → input → Enter).
 */
async function commit(page: Page, rowId: string, field: string, value: string): Promise<void> {
  const cell = page.locator(`[role="gridcell"][data-row-id="${rowId}"][data-field="${field}"]`).first();
  await cell.dblclick();
  const input = page.locator('input:focus, textarea:focus').first();
  await input.fill(value);
  await input.press('Enter');
}

async function tooltipFor(page: Page, rowId: string, field: string) {
  return page
    .locator(`[role="tooltip"][data-validation-target="${rowId}:${field}"]`)
    .first();
}

test.describe('Validation tooltip — portal + severity styling', () => {
  // Bump the per-test budget so first-hit Storybook compile + the 30s grid
  // wait above do not bust through the default 30s test timeout.
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    await page.goto(STORY_URL, { timeout: 60_000 });
    await waitForGrid(page);
  });

  test('error-severity: portal tooltip exists with a red background and an error icon (#65)', async ({ page }) => {
    // Row 1 / email — story wires an error-severity "invalid email" validator.
    await commit(page, '1', 'email', 'not-an-email');

    const tip = await tooltipFor(page, '1', 'email');
    await expect(tip).toBeVisible();

    // Must be a portal: parented at document.body (outside the grid).
    const isInGrid = await tip.evaluate((el) => {
      const grid = document.querySelector('[role="grid"]');
      return grid ? grid.contains(el) : false;
    });
    expect(isInGrid).toBe(false);

    // Background resolves from the design token to the red family.
    const bg = await tip.evaluate((el) => getComputedStyle(el).backgroundColor);
    const rgb = parseRgb(bg);
    expect(rgb).not.toBeNull();
    expect(isRedFamily(rgb!)).toBe(true);

    // Error icon present.
    await expect(tip.locator('[data-icon="error"]')).toHaveCount(1);

    // No inline role="alert" node inside the cell.
    const cell = page.locator('[role="gridcell"][data-row-id="1"][data-field="email"]').first();
    await expect(cell.locator('[role="alert"]')).toHaveCount(0);
  });

  test('warning-severity: tooltip background in the yellow family with a warning icon (#65)', async ({ page }) => {
    // The story's `name` column has a warning-severity rule ("letters only");
    // entering digits triggers it without failing the error-severity rule.
    await commit(page, '1', 'name', 'Alice99');

    const tip = await tooltipFor(page, '1', 'name');
    await expect(tip).toBeVisible();

    const bg = await tip.evaluate((el) => getComputedStyle(el).backgroundColor);
    const rgb = parseRgb(bg);
    expect(rgb).not.toBeNull();
    expect(isYellowFamily(rgb!)).toBe(true);

    await expect(tip.locator('[data-icon="warning"]')).toHaveCount(1);
  });

  test('two validators (error + warning): both messages listed, error first (#65)', async ({ page }) => {
    // The story's `name` column has two validators: minLength (error) and
    // letters-only (warning). An empty-then-digit value fires both: empty
    // hits minLength as error; "1" also contains a digit as warning. To hit
    // both at once we commit the digits-only short value "1", which fails
    // minLength (error) AND letters-only (warning).
    await commit(page, '1', 'name', '1');

    const tip = await tooltipFor(page, '1', 'name');
    await expect(tip).toBeVisible();

    const messages = tip.locator('[data-validation-message]');
    await expect(messages).toHaveCount(2);

    const texts = await messages.allTextContents();
    // Error must appear first (severity ordering).
    expect(texts[0]!.toLowerCase()).toContain('least');
    expect(texts[1]!.toLowerCase()).toContain('letters');

    // Severity ordering is also reflected on the per-entry attribute, so
    // downstream consumers can style without re-parsing text.
    const severities = await messages.evaluateAll((nodes) =>
      nodes.map((n) => (n as HTMLElement).getAttribute('data-severity')),
    );
    expect(severities).toEqual(['error', 'warning']);
  });

  test('no inline validation message is rendered inside an invalid cell (#65)', async ({ page }) => {
    await commit(page, '1', 'email', 'bad');

    const cell = page.locator('[role="gridcell"][data-row-id="1"][data-field="email"]').first();
    await expect(cell).toHaveAttribute('aria-invalid', 'true');
    await expect(cell.locator('[role="alert"]')).toHaveCount(0);
    await expect(cell.locator('[data-testid="validation-error-email"]')).toHaveCount(0);
  });
});
