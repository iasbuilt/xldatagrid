/**
 * End-to-end: RichText cell ALT+ENTER soft line break (issue #97 — Excel parity).
 *
 * Drives the `Examples/Cell Types → AllCellTypes` story (the same harness
 * exercised by `rich-text-floating-menu.spec.ts` and `grid-xss.spec.ts`),
 * which provides a `MuiRichTextCell`-rendered `richText` column.
 *
 * Contract (matches issue #97):
 *   - Plain ENTER while editing commits the draft and exits edit mode.
 *   - ALT+ENTER inserts a `\n` at the caret WITHOUT committing or moving
 *     selection off the cell — Excel users expect this gesture for
 *     multi-line cell content.
 *   - The committed value must include both `line1` and `line2` separated
 *     by a soft break.
 *   - After commit, the rendered display surface must visually present
 *     two lines (`<br>` from markdown's "two trailing spaces" or two
 *     paragraphs from a blank-line separator are both acceptable; we
 *     assert via measured line count on the rendered surface).
 */
import { test, expect, type Locator, type Page } from '@playwright/test';

const CELL_TYPES_URL =
  '/iframe.html?viewMode=story&id=examples-cell-types--all-cell-types';

function richTextCell(page: Page, rowId: string): Locator {
  return page.locator(
    `[role="gridcell"][data-row-id="${rowId}"][data-field="richText"]`,
  );
}

/**
 * Enters edit mode on a rich-text cell via double-click. Mirrors the helper
 * used in `rich-text-floating-menu.spec.ts` so editor-surface resolution
 * works across either the textarea or the contenteditable companion.
 */
async function enterEditMode(cell: Locator): Promise<void> {
  await cell.dblclick();
  await cell
    .locator('textarea, [contenteditable="true"]')
    .first()
    .waitFor({ state: 'visible' });
}

test.describe('RichText cell – ALT+ENTER soft line break (#97)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(CELL_TYPES_URL);
    await page.locator('[role="grid"]').first().waitFor({ state: 'visible' });
  });

  test('ALT+ENTER inserts a soft line break; ENTER commits both lines (#97)', async ({ page }) => {
    const cell = richTextCell(page, '1');
    await expect(cell).toBeVisible();
    await enterEditMode(cell);

    // The textarea mirror is the canonical raw-markdown source — driving it
    // directly avoids contenteditable selection ambiguity and matches the
    // pattern in `grid-xss.spec.ts`.
    const textarea = cell.locator('textarea').first();
    await expect(textarea).toBeVisible();

    // Clear any seed markdown so the assertion below reasons about only
    // what this test typed.
    await textarea.click();
    await textarea.press('ControlOrMeta+a');
    await textarea.press('Delete');

    await textarea.type('line1');
    await textarea.press('Alt+Enter');
    await textarea.type('line2');

    // ALT+ENTER must NOT have committed — the textarea is still visible and
    // its current value carries both lines separated by a CommonMark hard
    // break (`  \n` — two trailing spaces then newline), which renders as
    // `<br>` in display mode without a `remark-breaks` plugin.
    await expect(textarea).toBeVisible();
    const midValue = await textarea.inputValue();
    expect(midValue).toBe('line1  \nline2');

    // Plain ENTER commits the draft and leaves the cell in display mode.
    await textarea.press('Enter');

    // The textarea is gone — we are back in display mode.
    await expect(cell.locator('textarea')).toHaveCount(0);

    // Rendered display surface contains both lines.
    const rendered = cell.locator('[data-testid="richtext-rendered"]');
    await expect(rendered).toBeVisible();
    const text = (await rendered.innerText()).trim();
    expect(text).toContain('line1');
    expect(text).toContain('line2');

    // The break must materialise as a `<br>` element — that is the
    // CommonMark rendering of the `  \n` hard-break we inserted, and the
    // load-bearing piece of "Excel parity": the display must visually
    // wrap the cell onto two lines.
    const breakCount = await rendered.locator('br').count();
    expect(
      breakCount,
      `expected a <br> in the rendered cell after ALT+ENTER + ENTER`,
    ).toBeGreaterThanOrEqual(1);
  });
});
