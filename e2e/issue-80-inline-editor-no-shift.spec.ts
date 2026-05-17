/**
 * End-to-end (issue #80): the inline `<input>` editor must keep the cell's
 * displayed text on the SAME pixel when edit mode begins.
 *
 * Excel-365 contract: double-clicking a cell to enter edit mode shows only a
 * blinking caret as a visible change. The first glyph of the rendered text
 * (the `[data-cell-text]` span in display mode) must land on the same
 * `(x, y)` as the input's content-box top-left in edit mode. Anything more
 * is a visual "jump" — the original bug produced ~12 px of horizontal shift
 * because `styles.cellInput` declared `padding: 0` while the cell used
 * `padding: var(--dg-cell-padding, 0 12px)`.
 *
 * This spec sits alongside the existing `editor-padding.spec.ts` (which
 * pins the first-glyph X position and computed-style parity). It adds the
 * stricter "no-shift" rect contract called out by #80:
 *
 *   1. Snapshot the bounding rect of the cell's text content BEFORE
 *      double-clicking.
 *   2. Double-click to mount the editor.
 *   3. Snapshot the bounding rect of the input's content area
 *      (border-box minus border + padding).
 *   4. Assert the X / Y position delta is ≤ 1 px (sub-pixel rounding only)
 *      on both axes.
 */
import { test, expect, type Locator, type Page } from '@playwright/test';

const INLINE_EDITING_URL =
  '/iframe.html?viewMode=story&id=examples-editing--inline-editing';

function cell(page: Page, rowId: string, field: string): Locator {
  return page.locator(
    `[role="gridcell"][data-row-id="${rowId}"][data-field="${field}"]`,
  );
}

/**
 * Reads the bounding rect of the first non-empty text node inside `el` via a
 * `Range`. We deliberately measure the actual glyph box rather than the
 * wrapping `<span>` — its rect may include line-box padding the user can't
 * see, and we want the pixel position of the rendered text. Returns the
 * left edge (X of first glyph) and the *vertical midline* of the glyph box
 * so we can compare like-for-like against the input's vertically-centered
 * line box without conflating padding-top with glyph-top.
 */
async function textContentRect(loc: Locator): Promise<{ x: number; midY: number }> {
  return loc.evaluate((el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node: Node | null = walker.nextNode();
    while (node && !(node.nodeValue && node.nodeValue.trim().length > 0)) {
      node = walker.nextNode();
    }
    if (!node) throw new Error('no text node in cell');
    const range = document.createRange();
    range.selectNodeContents(node);
    const r = range.getBoundingClientRect();
    return { x: r.left, midY: r.top + r.height / 2 };
  });
}

/**
 * Where the first glyph the user is about to type will sit inside the
 * editor. X is the input's border + padding origin (content-area left).
 * Y is the *vertical midline* of the input's border-box: native `<input>`
 * elements vertically center their single line of text inside their box,
 * so a centered glyph's Y maps to the box midline regardless of font-size,
 * leading, or line-height (all of which are inherited from the cell). This
 * is the correct comparison against the display-text's vertical midline:
 * if the box itself doesn't shift, the rendered glyph cannot.
 */
async function inputContentRect(input: Locator): Promise<{ x: number; midY: number }> {
  return input.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const pl = parseFloat(cs.paddingLeft || '0') || 0;
    const bl = parseFloat(cs.borderLeftWidth || '0') || 0;
    return { x: rect.left + bl + pl, midY: rect.top + rect.height / 2 };
  });
}

test.describe('Issue #80 — inline editor padding matches cell padding (no-shift on enter-edit)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(INLINE_EDITING_URL);
    await page.locator('[role="grid"]').first().waitFor({ state: 'visible' });
  });

  test('text rect BEFORE dblclick matches input content rect AFTER (≤ 1px on both axes)', async ({ page }) => {
    const target = cell(page, '1', 'name');
    await target.click();
    await expect(target).toHaveAttribute('aria-selected', 'true');

    // 1. Snapshot the displayed text's rect BEFORE entering edit mode.
    const before = await textContentRect(target);

    // 2. Enter edit mode.
    await target.dblclick();
    const input = target.locator('input');
    await expect(input).toBeVisible();

    // 3. Snapshot the input's content-area origin AFTER edit begins.
    const after = await inputContentRect(input);

    // 4. The first glyph must not have moved. X: content-area left of the
    //    input == left edge of the rendered glyph. Y: vertical midline of
    //    the input box == vertical midline of the glyph (both are centered
    //    by the surrounding flex `alignItems: center` on the cell).
    expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.midY - before.midY)).toBeLessThanOrEqual(1);
  });

  test('text rect == input content rect across multiple rows (regression sweep)', async ({ page }) => {
    // Sweep a few rows so a regression in a single column's renderer (e.g.
    // alternating row-stripe background or per-row chrome) can't accidentally
    // pass while the typical case breaks.
    for (const rowId of ['1', '2', '3']) {
      const target = cell(page, rowId, 'name');
      await target.click();
      const before = await textContentRect(target);

      await target.dblclick();
      const input = target.locator('input');
      await expect(input).toBeVisible();

      const after = await inputContentRect(input);
      expect(Math.abs(after.x - before.x), `row ${rowId} X delta`).toBeLessThanOrEqual(1);
      expect(Math.abs(after.midY - before.midY), `row ${rowId} midY delta`).toBeLessThanOrEqual(1);

      // Exit edit mode before moving to the next row so the next dblclick
      // starts from a clean state (no draft, no focus on a stale input).
      await page.keyboard.press('Escape');
      await expect(input).toHaveCount(0);
    }
  });
});
