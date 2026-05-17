/**
 * End-to-end: type-to-enter-edit seeds an edit on the selected cell (#71).
 *
 * Companion to `type-to-edit.spec.ts` which covers the contract from the
 * issue body verbatim. This spec hardens the "empty cell" and "multi-char
 * follow-up typing" paths that the original spec leaves implicit:
 *
 *   * EMPTY cell (cleared via Delete) + a typed char → edit mode, value = char.
 *   * Continued typing extends the seeded value (caret must land at the end
 *     so subsequent keystrokes APPEND rather than replace — this is the
 *     dblclick-then-type race condition guarded by the nested rAF in
 *     `packages/react/src/use-keyboard.ts`).
 *   * Enter commits the multi-char string; cell shows the full typed value.
 *   * NON-empty cell + typed char → same replace-and-seed behaviour.
 *
 * Story: `examples-editing--inline-editing`. Row 1 / column 1 is the
 * editable `name` text column. We clear the cell with Delete to create the
 * empty-cell state, then exercise the type-to-edit flow.
 *
 * Per-keystroke `delay: 20` is the same pacing used in
 * `numeric-edit-replace-not-append.spec.ts` to keep the nested
 * setSelectionRange race deterministic when CPU contention is high (e.g.
 * pre-push hook running multiple servers in parallel).
 */
import { test, expect, type Locator, type Page } from '@playwright/test';

const STORY_URL =
  '/iframe.html?viewMode=story&id=examples-editing--inline-editing';

async function waitForGrid(page: Page): Promise<void> {
  await page.locator('[role="grid"]').first().waitFor({ state: 'visible' });
}

function firstEditableCell(page: Page): Locator {
  return page.locator('[role="gridcell"][data-field]').first();
}

async function selectCell(cell: Locator): Promise<void> {
  await cell.click();
  await expect(cell).toHaveAttribute('aria-selected', 'true');
}

async function clearCell(cell: Locator): Promise<void> {
  await selectCell(cell);
  // Delete clears the selected cell's value (use-keyboard.ts `case 'Delete'`).
  await cell.page().keyboard.press('Delete');
  await expect(cell).toHaveText('');
}

test.describe('Issue #71 — type-to-enter-edit (selected cell)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(STORY_URL);
    await waitForGrid(page);
  });

  test('empty cell + printable key enters edit mode seeded with the typed char (#71)', async ({
    page,
  }) => {
    const cell = firstEditableCell(page);
    await clearCell(cell);

    // Cell is now empty; the cell remains selected after Delete.
    await expect(cell).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('h');

    const editor = cell
      .locator('input, textarea, [contenteditable="true"]')
      .first();
    await expect(editor).toBeVisible();

    const value = await editor.evaluate((el) => {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        return el.value;
      }
      return (el as HTMLElement).textContent ?? '';
    });
    expect(value).toBe('h');
  });

  test('typing additional chars after the seed appends rather than replaces (#71)', async ({
    page,
  }) => {
    const cell = firstEditableCell(page);
    await clearCell(cell);

    // Seed the editor with the first char via the type-to-edit handler, then
    // continue typing through the now-mounted input. The caret must land at
    // position `len` so the follow-up chars append.
    await page.keyboard.press('h');
    const editor = cell
      .locator('input, textarea, [contenteditable="true"]')
      .first();
    await expect(editor).toBeVisible();

    await page.keyboard.type('ello', { delay: 20 });

    const value = await editor.evaluate((el) => {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        return el.value;
      }
      return (el as HTMLElement).textContent ?? '';
    });
    expect(value).toBe('hello');
  });

  test('Enter commits the multi-char typed value to the empty cell (#71)', async ({
    page,
  }) => {
    const cell = firstEditableCell(page);
    await clearCell(cell);

    await page.keyboard.press('w');
    await expect(
      cell.locator('input, textarea, [contenteditable="true"]'),
    ).toHaveCount(1);
    await page.keyboard.type('orld', { delay: 20 });
    await page.keyboard.press('Enter');

    // Editor unmounts on commit; the cell text is the committed string.
    await expect(
      cell.locator('input, textarea, [contenteditable="true"]'),
    ).toHaveCount(0);
    await expect(cell).toHaveText('world');
  });

  test('non-empty cell + printable key replaces the existing value with the typed char (#71)', async ({
    page,
  }) => {
    const cell = firstEditableCell(page);
    await selectCell(cell);

    // Pre-existing non-empty content on row 1 / col 1 (`name`).
    const before = (await cell.textContent())?.trim() ?? '';
    expect(before.length).toBeGreaterThan(0);

    await page.keyboard.press('z');

    const editor = cell
      .locator('input, textarea, [contenteditable="true"]')
      .first();
    await expect(editor).toBeVisible();

    const value = await editor.evaluate((el) => {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        return el.value;
      }
      return (el as HTMLElement).textContent ?? '';
    });
    expect(value).toBe('z');

    // Continued typing must extend the seed, not be swallowed by a stray
    // .select() that would replace the seed with the next char.
    await page.keyboard.type('ed', { delay: 20 });
    const after = await editor.evaluate((el) => {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        return el.value;
      }
      return (el as HTMLElement).textContent ?? '';
    });
    expect(after).toBe('zed');
  });
});
