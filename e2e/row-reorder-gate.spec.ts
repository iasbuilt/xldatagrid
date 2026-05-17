/**
 * End-to-end: row reorder must originate on the chrome row-number cell (#73).
 *
 * Contract (see GitHub #73): a row drag is ONLY initiated when mousedown
 * lands on a `[data-chrome="row-number"]` cell. Drags starting on any
 * `role="gridcell"` outside the row-number gutter must not produce a
 * drop-indicator and must not commit a reorder. This mirrors Excel /
 * Google Sheets: the row gutter is the row's drag handle.
 *
 * Story: `examples-chrome-columns--drag-reorder` — already has
 * `chrome.rowNumbers.reorderable: true`.
 *
 * Expected to FAIL today: the reorder gesture is wired at the row level
 * rather than gated on the row-number cell.
 */
import { test, expect, type Locator, type Page } from '@playwright/test';

const STORY_URL =
  '/iframe.html?viewMode=story&id=examples-chrome-columns--drag-reorder';

async function waitForGrid(page: Page): Promise<void> {
  // First-render of a Storybook iframe can take longer than the default 7.5s
  // expect timeout — Vite's lazy-compile pipeline blocks the page until the
  // story module graph is ready. 30s mirrors the navigationTimeout in
  // playwright.config.ts and matches how the rest of the e2e suite waits.
  await page
    .locator('[role="grid"]')
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 });
}

function rowNumberCell(page: Page, rowIndex: number): Locator {
  return page.locator('[data-chrome="row-number"]').nth(rowIndex);
}

function dataCell(page: Page, rowIndex: number): Locator {
  return page
    .locator('[role="row"]')
    .nth(rowIndex + 1 /* skip header row */)
    .locator('[role="gridcell"]:not([data-chrome])')
    .first();
}

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
  const endY = tgtBox.y + tgtBox.height * 0.25;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY + 5, { steps: 2 });
  await page.mouse.move(endX, endY, { steps: 10 });
}

test.describe('Row reorder gesture gate (#73)', () => {
  // Storybook iframe cold-compile + grid render can easily exceed the default
  // 30s per-test timeout when this spec is the first one to hit the story.
  test.setTimeout(90_000);
  // Storybook's dev server can drop connections under sustained parallel
  // pressure (HMR socket churn); a single retry lets the worker reconnect
  // without poisoning the suite.
  test.describe.configure({ retries: 1 });

  test.beforeEach(async ({ page }) => {
    await page.goto(STORY_URL, { timeout: 60_000 });
    await waitForGrid(page);
  });

  test('row-reorder-gate: dragging from a data cell never emits a rowReorder event or drop indicator (#73)', async ({
    page,
  }) => {
    // The drag-reorder story exposes a live log (`log.length ? log.join(...) :
    // '(drag a row to reorder)'`) — capture its DOM so we can later assert
    // nothing was appended. We find the log node via its placeholder text
    // because the story does not expose a stable test id for it.
    const log = page
      .locator('pre, code, [data-testid="reorder-log"]')
      .filter({ hasText: /(drag a row to reorder|^reorder)/ })
      .first();
    await expect(log).toBeVisible();
    const before = (await log.textContent())?.trim() ?? '';

    const source = dataCell(page, 0);
    const target = rowNumberCell(page, 2);
    await expect(source).toBeVisible();
    await expect(target).toBeVisible();

    await dragFromTo(page, source, target);

    // NO target row should carry a drop-indicator attribute — the drag was
    // not supposed to start from a data cell.
    await expect(
      page.locator('[data-chrome="row-number"][data-drop-indicator]'),
    ).toHaveCount(0);

    await page.mouse.up();

    // Log must not have grown with a reorder entry.
    const after = (await log.textContent())?.trim() ?? '';
    expect(after).toBe(before);
  });

  test('row-reorder-gate: dragging from the row-number cell works (backstop) — target row exposes data-drop-indicator (#73)', async ({
    page,
  }) => {
    const source = rowNumberCell(page, 0);
    const target = rowNumberCell(page, 2);
    await dragFromTo(page, source, target);

    await expect(target).toHaveAttribute(
      'data-drop-indicator',
      /above|below/,
    );
    await page.mouse.up();
  });

  test('row-reorder-gate: row-number cell carries draggable="true" while data cells carry draggable="false" (or omitted) (#73)', async ({
    page,
  }) => {
    const rowNumber = rowNumberCell(page, 0);
    const data = dataCell(page, 0);
    await expect(rowNumber).toBeVisible();
    await expect(data).toBeVisible();

    await expect(rowNumber).toHaveAttribute('draggable', 'true');

    const dataDraggable = await data.getAttribute('draggable');
    expect(
      dataDraggable === null || dataDraggable === 'false',
      `data cells must not be draggable; got draggable="${dataDraggable}"`,
    ).toBe(true);
  });
});
