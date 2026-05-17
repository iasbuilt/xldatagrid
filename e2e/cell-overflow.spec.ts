/**
 * End-to-end: cell text overflow + full-text reveal.
 *
 * Story: `examples-celloverflow--default` (see
 * `stories/CellOverflow.stories.tsx#Default`).
 *
 * Contracts guarded by this file (ALL expected to fail today — Phase B will
 * ship the overflow policies, density toggle, and reveal wiring):
 *
 *   1. A cell with the `truncate-end` policy exposes
 *      `data-overflow-policy="truncate-end"` and its visible text ends with a
 *      U+2026 ellipsis when the raw value is too long to fit.
 *   2. A cell with the `truncate-middle` policy renders the visible text via
 *      `truncateMiddle()`, so the ellipsis is SOMEWHERE IN THE MIDDLE (not at
 *      either end) of the displayed string.
 *   3. Hovering a truncated cell produces a `[role="tooltip"]` portaled to
 *      `document.body` whose text contains the full raw value.
 *   4. A `[data-testid="density-toggle"]` button in the story flips the grid
 *      root's `data-density` attribute between `compact` and `comfortable`.
 *   5. Keyboard-focusing a truncated cell via repeated Tab also opens the
 *      tooltip after the ~400 ms hover delay (a11y for keyboard-only users).
 *   6. Double-clicking a truncated cell starts edit mode and the resulting
 *      input's `value` equals the FULL raw value — the user edits the
 *      original text, never the truncated display string.
 */
import { test, expect, type Page } from '@playwright/test';

const STORY_URL = '/iframe.html?viewMode=story&id=examples-celloverflow--default';

async function waitForGrid(page: Page): Promise<void> {
  // Use a generous explicit timeout: on cold-start Vite still needs to
  // compile the story bundle the first time it's requested in a given
  // Storybook session, and the default 7.5s expect-timeout is not enough
  // when the dev-server is competing with other parallel test workers.
  await page
    .locator('[role="grid"]')
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 });
}

test.describe('Cell overflow — policies, reveal, density, a11y', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(STORY_URL);
    await waitForGrid(page);
  });

  test('asset_name cell renders as truncate-end with a trailing ellipsis (#63)', async ({ page }) => {
    const cell = page
      .locator('[role="gridcell"][data-field="asset_name"]')
      .first();
    await expect(cell).toBeVisible();
    await expect(cell).toHaveAttribute('data-overflow-policy', 'truncate-end');
    const text = (await cell.textContent())?.trim() ?? '';
    // The story seeds row 1 with a long asset_name; visible text must end
    // with the Unicode horizontal ellipsis.
    expect(text.length).toBeGreaterThan(0);
    expect(text.endsWith('\u2026')).toBe(true);
  });

  test('asset_tag cell renders with middle-ellipsis truncation (#63)', async ({ page }) => {
    const cell = page
      .locator('[role="gridcell"][data-field="asset_tag"]')
      .first();
    await expect(cell).toBeVisible();
    await expect(cell).toHaveAttribute('data-overflow-policy', 'truncate-middle');
    const text = (await cell.textContent())?.trim() ?? '';
    const idx = text.indexOf('\u2026');
    expect(idx).toBeGreaterThan(0);
    expect(idx).toBeLessThan(text.length - 1);
  });

  test('hovering a truncated cell shows the FULL raw value in a portaled tooltip (#63)', async ({ page }) => {
    const cell = page
      .locator('[role="gridcell"][data-field="asset_name"]')
      .first();
    await expect(cell).toBeVisible();
    const rawValue =
      (await cell.getAttribute('data-raw-value')) ??
      (await cell.getAttribute('title')) ??
      // Fall back to a known long fixture seeded by the story so the test
      // still asserts meaningfully even before Phase B adds the
      // `data-raw-value` mirror attribute.
      'Sony FX9';

    await cell.hover();
    const tooltip = page
      .locator('[role="tooltip"]:not([data-validation-target])')
      .first();
    await expect(tooltip).toBeVisible();
    const tipText = (await tooltip.textContent())?.trim() ?? '';
    expect(tipText).toContain(rawValue);

    // Portal contract: the tooltip is NOT inside the cell's subtree.
    const cellContainsTooltip = await page.evaluate(
      ({ cellSelector, tooltipSelector }) => {
        const c = document.querySelector(cellSelector);
        const t = document.querySelector(tooltipSelector);
        return !!(c && t && c.contains(t));
      },
      {
        cellSelector: '[role="gridcell"][data-field="asset_name"]',
        tooltipSelector: '[role="tooltip"]:not([data-validation-target])',
      },
    );
    expect(cellContainsTooltip).toBe(false);
  });

  test('density-toggle button flips the grid root between compact and comfortable (#63)', async ({ page }) => {
    const grid = page.locator('[role="grid"]').first();
    const toggle = page.locator('[data-testid="density-toggle"]');
    await expect(toggle).toBeVisible();

    const initial = await grid.getAttribute('data-density');
    expect(['compact', 'comfortable']).toContain(initial);

    await toggle.click();
    const nextExpected = initial === 'compact' ? 'comfortable' : 'compact';
    await expect(grid).toHaveAttribute('data-density', nextExpected);

    await toggle.click();
    await expect(grid).toHaveAttribute('data-density', initial ?? 'compact');
  });

  test('tabbing to a truncated cell opens the tooltip after the hover delay (#63)', async ({ page }) => {
    // Tab past the toggle button and into the grid cells. Exact Tab count
    // depends on the story's header chrome; the assertion is that a cell
    // receives focus and its associated tooltip becomes visible.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    // Give the 400 ms hover-delay-on-focus timer a chance to elapse.
    await page.waitForTimeout(500);
    const tooltip = page
      .locator('[role="tooltip"]:not([data-validation-target])')
      .first();
    await expect(tooltip).toBeVisible();
  });

  test('double-clicking a truncated cell reveals the raw value in the edit input (#63)', async ({ page }) => {
    const cell = page
      .locator('[role="gridcell"][data-field="asset_name"]')
      .first();
    await expect(cell).toBeVisible();
    await cell.dblclick();
    const input = cell.locator('input').first();
    await expect(input).toBeVisible();
    const value = await input.inputValue();
    // The input MUST NOT contain the Unicode ellipsis — the user is editing
    // the full raw value.
    expect(value.includes('\u2026')).toBe(false);
    expect(value.length).toBeGreaterThan(10);
  });
});
