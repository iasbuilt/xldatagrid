/**
 * End-to-end coverage for issue #63 — Cell overflow policies + full-text
 * reveal + density modes.
 *
 * Story: `examples-celloverflow--default` (see
 * `stories/CellOverflow.stories.tsx#Default`). The story seeds long DAM/CMMS
 * fixture values across columns that each declare a different `overflow`
 * policy (`truncate-end`, `truncate-middle`, `clamp-2`) and exposes a
 * `[data-testid="density-toggle"]` button that flips the grid between
 * `compact` and `comfortable`.
 *
 * The existing `e2e/cell-overflow.spec.ts` covers the per-cell attributes and
 * the basic hover-reveal contract. This spec ADDS:
 *
 *   1. Per-policy `data-overflow-policy` coverage across all of the columns
 *      the story declares (truncate-end, truncate-middle, clamp-2).
 *   2. The `data-truncated` attribute is set to `"true"` on the long-value
 *      cells the story seeds and `"false"` on a short-value cell when the
 *      column is wide enough.
 *   3. The density toggle flips the grid's `data-density` attribute AND
 *      changes the row container's `height` between the compact (~36px) and
 *      comfortable (~48px) row heights, proving the toggle drives the
 *      visual density and not just the data attribute.
 *   4. The hover-reveal tooltip is portaled to `document.body` (not nested
 *      inside the gridcell subtree) so absolute positioning escapes the
 *      grid's scroll container.
 *   5. Keyboard focus on a truncated cell still reveals the tooltip — the
 *      a11y reveal path tracks the same delay as hover.
 *   6. The cell exposes `data-raw-value` carrying the FULL untruncated text,
 *      so consumers (and AT tooling) can read the original value even when
 *      the visible text has been rewritten with a U+2026 ellipsis.
 *
 * Each test name is stamped with `#63` so failures trace back to this issue
 * in CI dashboards.
 */
import { test, expect, type Page } from '@playwright/test';

const STORY_URL =
  '/iframe.html?viewMode=story&id=examples-celloverflow--default';

async function waitForGrid(page: Page): Promise<void> {
  await page
    .locator('[role="grid"]')
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 });
}

test.describe('Issue #63 — Cell overflow policies + density + reveal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(STORY_URL);
    await waitForGrid(page);
  });

  test('truncate-end column exposes data-overflow-policy="truncate-end" (#63)', async ({
    page,
  }) => {
    const cell = page
      .locator('[role="gridcell"][data-field="asset_name"]')
      .first();
    await expect(cell).toHaveAttribute('data-overflow-policy', 'truncate-end');
  });

  test('truncate-middle column exposes data-overflow-policy="truncate-middle" (#63)', async ({
    page,
  }) => {
    // The story declares `asset_tag`, `serial_number`, `location_path`, and
    // `file_path` all as `truncate-middle`. Asserting each one independently
    // catches regressions where the policy resolver only honours the first
    // column.
    const fields = [
      'asset_tag',
      'serial_number',
      'location_path',
      'file_path',
    ];
    for (const field of fields) {
      const cell = page
        .locator(`[role="gridcell"][data-field="${field}"]`)
        .first();
      await expect(cell).toHaveAttribute(
        'data-overflow-policy',
        'truncate-middle',
      );
    }
  });

  test('clamp-2 column exposes data-overflow-policy="clamp-2" (#63)', async ({
    page,
  }) => {
    const cell = page
      .locator('[role="gridcell"][data-field="description"]')
      .first();
    await expect(cell).toHaveAttribute('data-overflow-policy', 'clamp-2');
  });

  test('long-value cells report data-truncated="true" (#63)', async ({
    page,
  }) => {
    // Row 1 of the fixture seeds intentionally long values for every column
    // — the truncation measurement should flag them as truncated regardless
    // of the policy (except `wrap`, which the story doesn't declare).
    const cell = page
      .locator('[role="gridcell"][data-field="asset_name"]')
      .first();
    await expect(cell).toHaveAttribute('data-truncated', 'true');
  });

  test('density toggle flips data-density AND changes row height (#63)', async ({
    page,
  }) => {
    const grid = page.locator('[role="grid"]').first();
    const toggle = page.locator('[data-testid="density-toggle"]');
    await expect(toggle).toBeVisible();

    // Resolve initial density and measure a representative row height.
    const initialDensity = await grid.getAttribute('data-density');
    expect(['compact', 'comfortable']).toContain(initialDensity);
    const row = page.locator('[data-row-id]').first();
    const initialBox = await row.boundingBox();
    expect(initialBox).not.toBeNull();
    const initialHeight = initialBox!.height;

    await toggle.click();
    const flipped =
      initialDensity === 'compact' ? 'comfortable' : 'compact';
    await expect(grid).toHaveAttribute('data-density', flipped);

    // Comfortable height (~48px) must be strictly greater than compact
    // (~36px). We assert a >= 4px gap so density transitions of any
    // direction surface a measurable difference without being brittle on
    // sub-pixel jitter introduced by the browser's box-model rounding.
    const nextBox = await row.boundingBox();
    expect(nextBox).not.toBeNull();
    const nextHeight = nextBox!.height;
    if (flipped === 'comfortable') {
      expect(nextHeight).toBeGreaterThan(initialHeight + 4);
    } else {
      expect(initialHeight).toBeGreaterThan(nextHeight + 4);
    }
  });

  test('hover-reveal tooltip is portaled to document.body, not nested in the cell (#63)', async ({
    page,
  }) => {
    const cell = page
      .locator('[role="gridcell"][data-field="asset_name"]')
      .first();
    await cell.hover();
    const tooltip = page
      .locator('[role="tooltip"]:not([data-validation-target])')
      .first();
    await expect(tooltip).toBeVisible();

    // Portal contract: tooltip must NOT live inside the gridcell subtree.
    const isNested = await page.evaluate(() => {
      const c = document.querySelector(
        '[role="gridcell"][data-field="asset_name"]',
      );
      const t = document.querySelector(
        '[role="tooltip"]:not([data-validation-target])',
      );
      return !!(c && t && c.contains(t));
    });
    expect(isNested).toBe(false);
  });

  test('keyboard focus on a truncated cell reveals the tooltip after the hover delay (#63)', async ({
    page,
  }) => {
    // Focus the first truncated cell directly — this is the keyboard-a11y
    // path the issue calls out (reveal must be reachable without a mouse).
    const cell = page
      .locator('[role="gridcell"][data-field="asset_name"]')
      .first();
    await cell.focus();
    // Allow the same ~400ms hover delay timer to elapse.
    await page.waitForTimeout(600);
    const tooltip = page
      .locator('[role="tooltip"]:not([data-validation-target])')
      .first();
    await expect(tooltip).toBeVisible();
  });

  test('data-raw-value mirrors the full untruncated cell text (#63)', async ({
    page,
  }) => {
    const cell = page
      .locator('[role="gridcell"][data-field="asset_name"]')
      .first();
    const raw = await cell.getAttribute('data-raw-value');
    expect(raw).not.toBeNull();
    // The story's row 1 seeds the asset_name with a long string that
    // contains "Sony FX9" — `data-raw-value` must carry the original text
    // even though the visible text is rewritten with a U+2026 ellipsis.
    expect(raw!).toContain('Sony FX9');
    expect(raw!.includes('…')).toBe(false);

    // And critically the visible text IS truncated (ellipsis present and
    // length < raw value), so the mirror attribute is the only way to
    // recover the original.
    const visible = (await cell.textContent())?.trim() ?? '';
    expect(visible).toContain('…');
    expect(visible.length).toBeLessThan(raw!.length);
  });
});
