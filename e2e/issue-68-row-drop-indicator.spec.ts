/**
 * End-to-end (#68): row-wide drop indicator across the body row.
 *
 * Companion to `e2e/row-drop-indicator.spec.ts`, which covers the per-cell
 * `data-drop-indicator` attribute on the row-number gutter cell. This spec
 * exercises the additional, row-spanning indicator that issue #68 calls for —
 * a thick (>= 3px) coloured bar painted at the top or bottom edge of the
 * entire target row container, so the drop target is visible regardless of
 * where the cursor is along the row's horizontal axis.
 *
 * DOM contract (this spec):
 *   - The body row container (`[role="row"][data-row-id="<id>"]`) gains
 *     `data-drop-indicator="above" | "below"` while the pointer hovers it.
 *   - A child `<div data-row-drop-indicator="above"|"below">` is rendered
 *     inside the row container with computed height >= 3px.
 *   - The attribute and bar clear on drop or when the drag is cancelled, and
 *     the row order updates to reflect the chosen edge.
 */
import { test, expect, type Locator, type Page } from '@playwright/test';

const STORY_URL =
  '/iframe.html?viewMode=story&id=examples-chrome-columns--drag-reorder';

async function waitForGrid(page: Page): Promise<void> {
  // Allow a longer cold-load budget than the suite default: the Storybook
  // iframe occasionally takes >7.5s to compile + hydrate on a freshly-booted
  // server, and the failure mode is a hard timeout in `beforeEach` that
  // burns the whole test rather than just slowing it.
  await page
    .locator('[role="grid"]')
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 });
}

/**
 * Returns the row-number chrome cell for the Nth body row (0-based). The
 * `data-chrome="row-number"` attribute is the cross-cutting hook the chrome
 * cell renders; `nth()` is index-stable across re-renders provided no rows
 * scroll out of view (the DragReorder story renders 10 rows, all in view).
 */
function rowNumberCell(page: Page, rowIndex: number): Locator {
  return page.locator('[data-chrome="row-number"]').nth(rowIndex);
}

/**
 * Returns the row container (`[role="row"]`) for the Nth body row (0-based).
 * We filter on the presence of `data-row-id` to exclude the header row
 * (which is also `role="row"` but has no `data-row-id`).
 */
function bodyRow(page: Page, rowIndex: number): Locator {
  return page.locator('[role="row"][data-row-id]').nth(rowIndex);
}

/**
 * Drag from `source` to either the upper or lower half of `target` without
 * releasing. Leaves the drag in progress so the row-wide indicator can be
 * inspected mid-gesture.
 *
 * Uses `target`'s bounding box rather than the row container's — the
 * row-number cell is the actual drop target that the chrome cell listens
 * to. The pointer Y is set to 25% / 75% of the cell height so both `< half`
 * and `<= half` implementations resolve identically.
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
  const endY =
    half === 'upper'
      ? tgtBox.y + tgtBox.height * 0.25
      : tgtBox.y + tgtBox.height * 0.75;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Two-step move mirrors a real drag — some dnd implementations require a
  // post-mousedown motion before they register a drag start.
  await page.mouse.move(startX, startY + 5, { steps: 2 });
  await page.mouse.move(endX, endY, { steps: 10 });
}

test.describe('Row-wide drop indicator (#68)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(STORY_URL);
    await waitForGrid(page);
  });

  test('row-drop-indicator (#68): dragging over upper half paints a >=3px bar on the row top edge', async ({
    page,
  }) => {
    const source = rowNumberCell(page, 1); // "row 2" (1-based)
    const target = rowNumberCell(page, 4); // "row 5" (1-based)
    await expect(source).toBeVisible();
    await expect(target).toBeVisible();

    await dragOverHalf(page, source, target, 'upper');

    // The whole row container — not just the row-number cell — carries the
    // attribute, so the bar is visible regardless of where on the row the
    // cursor sits horizontally.
    const targetRow = bodyRow(page, 4);
    await expect(targetRow).toHaveAttribute('data-drop-indicator', 'above');

    const bar = targetRow.locator(
      ':scope > [data-row-drop-indicator="above"]',
    );
    await expect(bar).toHaveCount(1);
    const height = await bar.evaluate(
      (el) => el.getBoundingClientRect().height,
    );
    expect(height).toBeGreaterThanOrEqual(3);

    // The bar should sit at the row's top edge (within 1px to tolerate
    // sub-pixel rounding).
    const offsetTop = await bar.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const parentRect =
        (el.parentElement as HTMLElement).getBoundingClientRect();
      return rect.top - parentRect.top;
    });
    expect(Math.abs(offsetTop)).toBeLessThanOrEqual(1);

    await page.mouse.up();
  });

  test('row-drop-indicator (#68): dragging over lower half paints a >=3px bar on the row bottom edge', async ({
    page,
  }) => {
    const source = rowNumberCell(page, 1);
    const target = rowNumberCell(page, 4);

    await dragOverHalf(page, source, target, 'lower');

    const targetRow = bodyRow(page, 4);
    await expect(targetRow).toHaveAttribute('data-drop-indicator', 'below');

    const bar = targetRow.locator(
      ':scope > [data-row-drop-indicator="below"]',
    );
    await expect(bar).toHaveCount(1);
    const height = await bar.evaluate(
      (el) => el.getBoundingClientRect().height,
    );
    expect(height).toBeGreaterThanOrEqual(3);

    const offsetBottom = await bar.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const parentRect =
        (el.parentElement as HTMLElement).getBoundingClientRect();
      return parentRect.bottom - rect.bottom;
    });
    expect(Math.abs(offsetBottom)).toBeLessThanOrEqual(1);

    await page.mouse.up();
  });

  test('row-drop-indicator (#68): dropping clears the row-wide indicator attribute and bar from every row', async ({
    page,
  }) => {
    // The actual reorder commit is exercised in
    // `packages/react/src/__tests__/chrome-columns.test.tsx` (`drop on
    // another row triggers reorder`) — that path uses `fireEvent.dragStart`
    // / `fireEvent.drop` which deterministically wires HTML5 DnD. In
    // headless Chromium driven by `page.mouse.down + mousemove + up`, the
    // synthetic dragstart event is unreliable, so this spec focuses on the
    // visual cleanup contract: after `mouseup` the indicator attribute and
    // bar element must disappear from every row, regardless of whether the
    // synthetic drop succeeded.
    const source = rowNumberCell(page, 1);
    const target = rowNumberCell(page, 4);

    await dragOverHalf(page, source, target, 'lower');

    const targetRow = bodyRow(page, 4);
    await expect(targetRow).toHaveAttribute('data-drop-indicator', 'below');

    await page.mouse.up();

    // After drop / dragend the attribute must clear from EVERY body row.
    const withIndicator = page.locator(
      '[role="row"][data-row-id][data-drop-indicator]',
    );
    await expect(withIndicator).toHaveCount(0);

    // The bar element must clear from the DOM as well.
    const staleBars = page.locator('[data-row-drop-indicator]');
    await expect(staleBars).toHaveCount(0);
  });
});
