/**
 * End-to-end (#69): column drag-to-reorder shows a thick vertical drop
 * indicator on the left or right edge of the target column header, resolved
 * against the pointer's horizontal position within the cell.
 *
 * This spec is the issue-specific complement to the broader
 * `column-drop-indicator.spec.ts` contract suite. It walks the full
 * "drag-A, hover-C-left, then-C-right, drop" scenario in a single test and
 * asserts that the visible column order updates after the drop.
 *
 * Story: `examples-column-operations--column-reorder` — every column in this
 * story is reorderable, so we can grab the first ("name"  ≈ column A) and
 * the third ("department" ≈ column C) by their `data-field` attribute.
 */
import { test, expect, type Locator, type Page } from '@playwright/test';

const REORDER_URL =
  '/iframe.html?viewMode=story&id=examples-column-operations--column-reorder';

async function waitForGrid(page: Page): Promise<void> {
  // Storybook + Vite compile-on-demand can take longer than the default
  // 7.5s the first time a story is visited in a worker — give the grid
  // generous headroom so the spec is not flaky on cold caches.
  await page
    .locator('[role="grid"]')
    .first()
    .waitFor({ state: 'visible', timeout: 60_000 });
  await page
    .locator('[role="columnheader"][data-field]')
    .first()
    .waitFor({ state: 'visible', timeout: 60_000 });
}

function headerCell(page: Page, field: string): Locator {
  return page.locator(`[role="columnheader"][data-field="${field}"]`).first();
}

async function fieldOrder(page: Page): Promise<string[]> {
  return await page
    .locator('[role="columnheader"][data-field]')
    .evaluateAll((nodes) =>
      nodes
        .map((n) => (n as HTMLElement).getAttribute('data-field'))
        .filter((f): f is string => !!f),
    );
}

async function dragHover(
  page: Page,
  source: Locator,
  target: Locator,
  half: 'left' | 'right',
  { release }: { release: boolean } = { release: false },
): Promise<void> {
  const srcBox = await source.boundingBox();
  const tgtBox = await target.boundingBox();
  if (!srcBox || !tgtBox) throw new Error('boundingBox unavailable');
  const startX = srcBox.x + srcBox.width / 2;
  const startY = srcBox.y + srcBox.height / 2;
  const endY = tgtBox.y + tgtBox.height / 2;
  const endX =
    half === 'left'
      ? tgtBox.x + tgtBox.width * 0.25
      : tgtBox.x + tgtBox.width * 0.75;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Tiny nudge to seed the drag session before the long move.
  await page.mouse.move(startX + 5, startY, { steps: 2 });
  await page.mouse.move(endX, endY, { steps: 10 });
  if (release) await page.mouse.up();
}

test.describe('Issue #69 — column drop indicator on target edge', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(REORDER_URL);
    await waitForGrid(page);
  });

  test('column-drop-indicator: drag column A, hovering left vs right half of column C toggles the indicator edge, drop reorders the columns (#69)', async ({
    page,
  }) => {
    const initial = await fieldOrder(page);
    expect(initial.length).toBeGreaterThanOrEqual(3);

    // Column "A" → first reorderable header; Column "C" → third one.
    const fieldA = initial[0]!;
    const fieldC = initial[2]!;
    const colA = headerCell(page, fieldA);
    const colC = headerCell(page, fieldC);

    // 1) Hover the LEFT half of column C — indicator must land on the LEFT
    //    edge of C, and no indicator on the dragged source.
    await dragHover(page, colA, colC, 'left');
    await expect(colC).toHaveAttribute('data-drop-indicator', 'left');
    await expect(colA).not.toHaveAttribute('data-drop-indicator', /left|right/);
    const leftBar = colC.locator('[data-column-drop-indicator]');
    await expect(leftBar).toHaveCount(1);
    const leftBarOffset = await leftBar.evaluate((el) => {
      const parent = (el.parentElement as HTMLElement).getBoundingClientRect();
      const self = el.getBoundingClientRect();
      return self.left - parent.left;
    });
    expect(leftBarOffset).toBeLessThan(5);

    // 2) Slide to the RIGHT half of column C — same target, opposite edge.
    await dragHover(page, colA, colC, 'right');
    await expect(colC).toHaveAttribute('data-drop-indicator', 'right');
    const rightBar = colC.locator('[data-column-drop-indicator]');
    await expect(rightBar).toHaveCount(1);
    const rightEdgeGap = await rightBar.evaluate((el) => {
      const parent = (el.parentElement as HTMLElement).getBoundingClientRect();
      const self = el.getBoundingClientRect();
      return parent.right - self.right;
    });
    expect(rightEdgeGap).toBeLessThan(5);

    // 3) Drop — column order must change (A moved away from index 0).
    await page.mouse.up();
    await expect(colC).not.toHaveAttribute('data-drop-indicator', /left|right/);

    await expect
      .poll(async () => (await fieldOrder(page))[0])
      .not.toBe(fieldA);

    const after = await fieldOrder(page);
    expect(after).not.toEqual(initial);
    // The dragged column must still be present — reorder, not delete.
    expect(after).toContain(fieldA);
    expect(after).toHaveLength(initial.length);
  });
});
