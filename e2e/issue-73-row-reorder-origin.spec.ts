/**
 * End-to-end: row reorder gesture must originate on the chrome row-number
 * cell (#73).
 *
 * This spec complements `row-reorder-gate.spec.ts` with a narrower focus on
 * the *origin* of the drag — Excel-365 UX semantics:
 *
 *   - Mousedown on a regular data cell must NEVER initiate a row reorder.
 *     No `data-dragging` marker may appear on the row, no
 *     `[data-drop-indicator]` may appear on any row-number cell, and the
 *     gesture stays available for cell-selection / range extension.
 *   - Mousedown on the row-number gutter cell initiates the drag normally,
 *     and a drop-indicator appears on the row-number cell under the cursor
 *     as it moves over other rows.
 *   - Releasing the drag over another row's row-number cell commits the
 *     reorder — observed via the `Moved row from index … to …` entry that
 *     the `examples-chrome-columns--drag-reorder` story appends to its log.
 *
 * Story: `examples-chrome-columns--drag-reorder` (renders ten employee rows
 * with `chrome.rowNumbers.reorderable: true` and an `onRowReorder` callback
 * that logs each move).
 */
import { test, expect, type Locator, type Page } from '@playwright/test';

const STORY_URL =
  '/iframe.html?viewMode=story&id=examples-chrome-columns--drag-reorder';

async function waitForGrid(page: Page): Promise<void> {
  // Storybook's first-render of a Vite-compiled story can exceed the default
  // 7.5s expect timeout. 30s matches the navigationTimeout in playwright.config
  // and how the rest of the e2e suite waits for the grid.
  await page
    .locator('[role="grid"]')
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 });
}

function rowNumberCell(page: Page, oneBasedRowNumber: number): Locator {
  // `data-row-number` is the 1-based row index emitted by ChromeRowNumberCell;
  // it is stable across re-renders and unaffected by the (currently disabled
  // in this story) virtualisation windowing, so it's a robust handle.
  return page.locator(`[data-chrome="row-number"][data-row-number="${oneBasedRowNumber}"]`);
}

function dataCellInRow(page: Page, oneBasedRowNumber: number): Locator {
  // Find the row by its row-number cell, walk up to the role="row" container,
  // then pick the first non-chrome gridcell — the leftmost data cell.
  return page
    .locator(`[role="row"]:has([data-chrome="row-number"][data-row-number="${oneBasedRowNumber}"])`)
    .locator('[role="gridcell"]:not([data-chrome])')
    .first();
}

/**
 * Performs a synthetic press → small-move → long-move drag from `source` to
 * `target`. The intermediate `+5px` nudge convinces Chromium to fire the
 * HTML5 dragstart sequence (browsers debounce drags shorter than ~3-5px).
 *
 * Mouse stays down on return — callers decide whether to drop or release.
 */
async function dragFromTo(
  page: Page,
  source: Locator,
  target: Locator,
): Promise<void> {
  const srcBox = await source.boundingBox();
  const tgtBox = await target.boundingBox();
  if (!srcBox || !tgtBox) throw new Error('boundingBox unavailable');
  const startX = srcBox.x + srcBox.width / 2;
  const startY = srcBox.y + srcBox.height / 2;
  const endX = tgtBox.x + tgtBox.width / 2;
  // Land in the upper third so the drop-indicator resolves to `above` —
  // matches the visual semantics in the row-reorder-gate backstop spec.
  const endY = tgtBox.y + tgtBox.height * 0.3;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY + 5, { steps: 2 });
  await page.mouse.move(endX, endY, { steps: 10 });
}

test.describe('Row reorder originates on the row-number cell (#73)', () => {
  // Storybook iframe cold-compile + grid render can exceed the default 30s
  // per-test budget on the first spec to hit the story.
  test.setTimeout(90_000);
  // Storybook's dev server can drop connections under sustained parallel
  // pressure (HMR socket churn); a single retry lets the worker reconnect
  // without poisoning the suite.
  test.describe.configure({ retries: 1 });

  test.beforeEach(async ({ page }) => {
    await page.goto(STORY_URL, { timeout: 60_000 });
    await waitForGrid(page);
  });

  test('issue-73: mousedown on a data cell in row 3 does NOT initiate a row drag (#73)', async ({
    page,
  }) => {
    const log = page
      .locator('pre, code, [data-testid="reorder-log"]')
      .filter({ hasText: /(drag a row to reorder|^Moved row)/ })
      .first();
    await expect(log).toBeVisible();
    const before = (await log.textContent())?.trim() ?? '';

    const source = dataCellInRow(page, 3);
    const target = rowNumberCell(page, 6);
    await expect(source).toBeVisible();
    await expect(target).toBeVisible();

    await dragFromTo(page, source, target);

    // No row-number cell should display the drop indicator: the drag was
    // not allowed to start from a data cell, so the gate suppresses the
    // entire reorder pipeline.
    await expect(
      page.locator('[data-chrome="row-number"][data-drop-indicator]'),
    ).toHaveCount(0);

    // No row container should be marked as a drag source.
    await expect(
      page.locator('[role="row"][data-dragging]'),
    ).toHaveCount(0);

    // Release the mouse — completes the gesture without committing a row
    // move. The cell never advertised `draggable=true`, so HTML5 DnD never
    // fired; the gesture stays available for the cell-selection / range-
    // extension pipeline (governed by separate handlers).
    await page.mouse.up();
    await expect(source).not.toHaveAttribute('draggable', 'true');

    // The story's log must not have grown with a reorder entry.
    const after = (await log.textContent())?.trim() ?? '';
    expect(after).toBe(before);
  });

  test('issue-73: mousedown on row 3 row-number cell initiates drag and the drop indicator follows the cursor (#73)', async ({
    page,
  }) => {
    const source = rowNumberCell(page, 3);
    const target = rowNumberCell(page, 6);
    await expect(source).toBeVisible();
    await expect(target).toBeVisible();

    await dragFromTo(page, source, target);

    // The cursor's current row-number cell must expose the drop-indicator
    // marker — proving the HTML5 dragover pipeline is live.
    await expect(target).toHaveAttribute(
      'data-drop-indicator',
      /above|below/,
    );

    await page.mouse.up();
  });

  test('issue-73: dropping on row 6 commits a reorder (#73)', async ({
    page,
  }) => {
    const log = page
      .locator('pre, code, [data-testid="reorder-log"]')
      .filter({ hasText: /(drag a row to reorder|^Moved row)/ })
      .first();
    await expect(log).toBeVisible();

    const source = rowNumberCell(page, 3);
    const target = rowNumberCell(page, 6);
    await expect(source).toBeVisible();
    await expect(target).toBeVisible();

    await dragFromTo(page, source, target);
    await page.mouse.up();

    // The story renders `Moved row from index … to …` on every successful
    // reorder. The exact destructured payload shape is the story's concern;
    // the contract this spec checks is that *some* move entry was appended,
    // i.e. the drop ran the reorder pipeline end-to-end.
    await expect(log).toContainText(/Moved row from index/);
  });
});
