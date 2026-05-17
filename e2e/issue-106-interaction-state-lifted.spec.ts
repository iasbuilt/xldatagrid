/**
 * End-to-end: issue #106 — the four remaining DataGrid.tsx `useState`
 * holders (rowGroupExpanded / rowDragState / filterMenuOpen /
 * conditionDialogOpen) now live on the unified causl interaction node.
 *
 * The lift is a pure refactor: there is no new user-visible feature and no
 * existing behaviour should regress. This spec is the user-facing
 * "contract" guard for the lift — it drives the three behaviours powered
 * by those state holders end-to-end so a future regression in the
 * causl-backed wiring surfaces immediately:
 *
 *   1. Row drag — initiating a drag exposes the `data-drop-indicator`
 *      attribute (per #68's contract) and committing the drop clears it.
 *      This proves `rowDragState` round-trips through the causl node
 *      (start-row-drag → end-row-drag) without losing the source-row info
 *      the model uses for `moveRow`.
 *
 *   2. Excel filter menu — clicking the filter icon opens the dropdown
 *      and pressing Escape closes it. This proves `filterMenuOpen`
 *      (now `filterMenu: { type: 'open', field, anchor }`) is read off
 *      the unified state correctly and that `closeFilterMenu` short-
 *      circuits the reducer back to `closed`.
 *
 *   3. Row group collapse/expand — clicking the chevron on a group header
 *      flips `aria-expanded` (or, equivalently, hides the data rows for
 *      that group). This proves `rowGroupExpanded` toggles correctly via
 *      the new `toggleRowGroup` action.
 *
 * Stories:
 *   - Kitchen Sink (`examples-kitchen-sink--everything-at-once`) provides
 *     the MUI grid with `showFilterMenu` + reorderable row numbers — used
 *     for the row-drag and filter-menu checks.
 *   - Grouped Kitchen Sink (`pages-kitchen-sink--grouped-kitchen-sink`)
 *     groups rows by department with `defaultExpanded: true` — used for
 *     the row-group expand/collapse check.
 */
import { test, expect, type Locator, type Page } from '@playwright/test';

const KITCHEN_SINK_URL =
  '/iframe.html?viewMode=story&id=pages-kitchen-sink--everything-at-once';
const GROUPED_KITCHEN_SINK_URL =
  '/iframe.html?viewMode=story&id=pages-kitchen-sink--grouped-kitchen-sink';

async function waitForGrid(page: Page): Promise<void> {
  // Kitchen-sink stories are heavy first-paints (MUI theme bootstrap +
  // background indexer warm-up), so give the initial compile / render a
  // generous window before we conclude the grid never mounted.
  await page
    .locator('[role="grid"]')
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 });
}

function rowNumberCell(page: Page, rowIndex: number): Locator {
  return page.locator('[data-chrome="row-number"]').nth(rowIndex);
}

test.describe('Issue #106 — DataGrid local UI state lifted into causl', () => {
  test('row drag: starting a drag exposes the drop indicator and dropping clears it', async ({
    page,
  }) => {
    await page.goto(KITCHEN_SINK_URL);
    await waitForGrid(page);

    const source = rowNumberCell(page, 0);
    const target = rowNumberCell(page, 2);
    await expect(source).toBeVisible();
    await expect(target).toBeVisible();

    const srcBox = await source.boundingBox();
    const tgtBox = await target.boundingBox();
    if (!srcBox || !tgtBox) throw new Error('boundingBox unavailable');

    const startX = srcBox.x + srcBox.width / 2;
    const startY = srcBox.y + srcBox.height / 2;
    const endX = tgtBox.x + tgtBox.width / 2;
    // Aim for the upper third so the indicator resolves to "above".
    const endY = tgtBox.y + tgtBox.height * 0.25;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX, startY + 5, { steps: 2 });
    await page.mouse.move(endX, endY, { steps: 10 });

    // Mid-drag: the start-row-drag action committed via causl, so the
    // drop indicator (driven off the source row's existence) must paint.
    await expect(target).toHaveAttribute('data-drop-indicator', 'above');

    await page.mouse.up();

    // After the drop, `end-row-drag` flips `rowDrag` back to idle and the
    // indicator clears from every chrome cell.
    const withIndicator = page.locator(
      '[data-chrome="row-number"][data-drop-indicator]',
    );
    await expect(withIndicator).toHaveCount(0);
  });

  test('filter menu: clicking the column filter trigger opens the Excel dropdown and Escape closes it', async ({
    page,
  }) => {
    await page.goto(KITCHEN_SINK_URL);
    await waitForGrid(page);

    // The header's filter button has `aria-haspopup="menu"`. Pick the
    // first filterable column (the kitchen sink enables `showFilterMenu`
    // for all columns) to drive the open transition.
    const filterTrigger = page.locator('button[aria-haspopup="menu"]').first();
    await expect(filterTrigger).toBeVisible();
    await filterTrigger.click();

    const menu = page.locator('[data-testid="column-filter-menu"]');
    await expect(menu).toBeVisible();

    // Pressing Escape (or clicking outside) dispatches close-filter-menu,
    // which the reducer reads off the unified node and short-circuits to
    // `closed`. The menu unmounts on the next render.
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
  });

  test('row group: clicking a group header chevron collapses the group and re-clicking expands it', async ({
    page,
  }) => {
    await page.goto(GROUPED_KITCHEN_SINK_URL);
    await waitForGrid(page);

    // Grouped Kitchen Sink groups by `department` with defaultExpanded:
    // true. The body therefore renders one group-header-row per
    // department, each tagged with `data-group-key="<department>"`. Pick
    // the first group header to exercise the toggle.
    const firstGroupHeader = page
      .locator('[data-testid="group-header-row"]')
      .first();
    await expect(firstGroupHeader).toBeVisible();
    const groupKey = await firstGroupHeader.getAttribute('data-group-key');
    expect(groupKey).not.toBeNull();

    // Initially expanded → the aggregate row for THIS group is rendered.
    const aggregateRow = page.locator(
      `[data-testid="group-aggregate-row"][data-group-key="${groupKey}"]`,
    );
    await expect(aggregateRow).toHaveCount(1);

    // Click the header → toggle-row-group commits, `rowGroupExpanded`
    // loses this key, and the aggregate row unmounts. The Grouped
    // Kitchen Sink pins a ghost row to the bottom of the viewport, and
    // Playwright's scroll-into-view machinery sometimes parks the
    // group header behind it. Dispatch a synthetic click via the DOM to
    // sidestep pointer-event interception while still exercising the
    // same React onClick handler.
    await firstGroupHeader.dispatchEvent('click');
    await expect(aggregateRow).toHaveCount(0);

    // Click again → back to expanded.
    await firstGroupHeader.dispatchEvent('click');
    await expect(aggregateRow).toHaveCount(1);
  });
});
