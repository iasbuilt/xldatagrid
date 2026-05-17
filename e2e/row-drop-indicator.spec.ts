/**
 * End-to-end: row drag-to-reorder drop indicator (#68).
 *
 * Contract (see GitHub #68): while dragging a row, the grid exposes a
 * `data-drop-indicator` attribute on the hovered target whose value depends
 * on the pointer's vertical position:
 *
 *   - `data-drop-indicator="above"` — pointer in the upper half of the row
 *   - `data-drop-indicator="below"` — pointer in the lower half of the row
 *
 * A thick visual bar (≥ 3px) must render on the resolved edge so the user
 * can predict where the drop will commit. The attribute clears on drop or
 * dragleave.
 *
 * Story: `examples-chrome-columns--drag-reorder` — enables
 * `chrome.rowNumbers.reorderable`, which wires the row drag handle.
 *
 * These tests are expected to FAIL today: only the drag gesture works; the
 * drop-indicator attribute and bar have not been implemented yet.
 */
import { test, expect, type Locator, type Page } from '@playwright/test';

const STORY_URL =
  '/iframe.html?viewMode=story&id=examples-chrome-columns--drag-reorder';

async function waitForGrid(page: Page): Promise<void> {
  // Storybook iframe compile + hydrate occasionally exceeds the 7.5s default
  // expect-timeout when consecutive tests in the same worker reuse the same
  // dev-server worker; bumping the per-call wait avoids spurious failures
  // without softening the assertion semantics.
  await page
    .locator('[role="grid"]')
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 });
}

function rowNumberCell(page: Page, rowIndex: number): Locator {
  // `[data-chrome="row-number"]` is the cross-cutting hook the chrome cells
  // render; `nth()` picks the Nth row regardless of scroll offset.
  return page.locator('[data-chrome="row-number"]').nth(rowIndex);
}

/**
 * Simulates a drag from `source` onto the upper or lower half of `target`
 * without releasing — leaves the drag in progress so the drop-indicator
 * attribute can be inspected mid-gesture.
 */
async function dragOverHalf(
  page: Page,
  source: Locator,
  target: Locator,
  half: 'upper' | 'lower',
): Promise<void> {
  const srcBox = await source.boundingBox();
  const tgtBox = await target.boundingBox();
  if (!srcBox || !tgtBox) throw new Error('boundingBox unavailable');
  const startX = srcBox.x + srcBox.width / 2;
  const startY = srcBox.y + srcBox.height / 2;
  const endX = tgtBox.x + tgtBox.width / 2;
  // Upper quarter vs. lower three-quarters — avoids the exact midpoint so
  // implementations using `< half` vs `<= half` both resolve correctly.
  const endY =
    half === 'upper'
      ? tgtBox.y + tgtBox.height * 0.25
      : tgtBox.y + tgtBox.height * 0.75;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Two-step move mirrors a real drag — some dnd libraries require motion
  // after `mousedown` before they register the drag start.
  await page.mouse.move(startX, startY + 5, { steps: 2 });
  await page.mouse.move(endX, endY, { steps: 10 });
}

test.describe('Row drop indicator (#68)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(STORY_URL);
    await waitForGrid(page);
  });

  test('row-drop-indicator: dragging a row over the upper half of a target row sets data-drop-indicator="above" on the target (#68)', async ({
    page,
  }) => {
    const source = rowNumberCell(page, 0);
    const target = rowNumberCell(page, 2);
    await expect(source).toBeVisible();
    await expect(target).toBeVisible();

    await dragOverHalf(page, source, target, 'upper');
    await expect(target).toHaveAttribute('data-drop-indicator', 'above');

    await page.mouse.up();
  });

  test('row-drop-indicator: dragging over the lower half sets data-drop-indicator="below" on the target (#68)', async ({
    page,
  }) => {
    const source = rowNumberCell(page, 0);
    const target = rowNumberCell(page, 2);

    await dragOverHalf(page, source, target, 'lower');
    await expect(target).toHaveAttribute('data-drop-indicator', 'below');

    await page.mouse.up();
  });

  test('row-drop-indicator: indicator clears after drop is committed or the drag leaves the grid (#68)', async ({
    page,
  }) => {
    const source = rowNumberCell(page, 0);
    const target = rowNumberCell(page, 2);

    await dragOverHalf(page, source, target, 'upper');
    await expect(target).toHaveAttribute('data-drop-indicator', 'above');

    // Commit the drop — indicator must clear.
    await page.mouse.up();

    // After the drop, NO row-number cell should carry the attribute.
    const withIndicator = page.locator(
      '[data-chrome="row-number"][data-drop-indicator]',
    );
    await expect(withIndicator).toHaveCount(0);
  });

  test('row-drop-indicator: the indicator bar is visible with a non-zero computed height ≥ 3px on the target edge (#68)', async ({
    page,
  }) => {
    const source = rowNumberCell(page, 0);
    const target = rowNumberCell(page, 2);

    await dragOverHalf(page, source, target, 'upper');

    // The indicator element lives either as a child `<div
    // data-row-drop-indicator>` or as a styled pseudo-element. We check the
    // child-node path first (more inspectable); implementations may use the
    // pseudo path and rewire this contract as needed, but the height check
    // below still applies via `getComputedStyle`.
    const bar = target.locator('[data-row-drop-indicator]');
    await expect(bar).toHaveCount(1);
    const height = await bar.evaluate((el) => el.getBoundingClientRect().height);
    expect(height).toBeGreaterThanOrEqual(3);

    await page.mouse.up();
  });
});
