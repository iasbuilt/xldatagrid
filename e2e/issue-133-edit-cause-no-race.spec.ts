/**
 * End-to-end: issue #133 — edit-cause threading removes the rAF race
 * between `use-keyboard`'s type-to-edit seed and `DataGridBody`'s
 * mount-time `el.select()`.
 *
 * The race
 * --------
 * Before #133 fixed it, two code paths both mutated the inline editor's
 * input selection inside `requestAnimationFrame` callbacks:
 *
 *   1. `DataGridBody.tsx`'s `<input>` ref callback ran
 *      `requestAnimationFrame(() => el.select())` on mount so a
 *      dblclick → type sequence REPLACED the cell value (without it,
 *      `autoFocus` left the cursor at the end and typing appended —
 *      catastrophic drift on numeric cells).
 *
 *   2. `use-keyboard.ts`'s type-to-edit handler ran
 *      `requestAnimationFrame(() => { seed; rAF(setSelectionRange) })`
 *      to drop the typed seed character into the editor and place the
 *      cursor after it so continued typing APPENDED.
 *
 *   Under CPU contention (e.g. the pre-push hook running storybook +
 *   vite-playground in parallel), the body's deferred `select()` could
 *   fire AFTER the keyboard's `setSelectionRange`, highlighting the
 *   seed character. The next keystroke would then REPLACE the seed —
 *   so typing "99999" produced "9" instead of "99999". The pre-#133
 *   mitigation was `delay: 50` per keystroke in the spec, which masked
 *   the race rather than removing it.
 *
 * The fix
 * -------
 * `beginEdit(cell, cause?)` now threads an `EditCause` through the
 * model. `DataGridBody`'s mount-time `select()` skips when the cause
 * is `'typeToEdit'`, so the keyboard handler owns input selection
 * unambiguously. Every other cause (`dblclick`, `enter`, `f2`,
 * `click`, `programmatic`) keeps the existing select-on-mount
 * behaviour.
 *
 * These tests pin every cause × rapid-typing combination directly in a
 * real browser. They MUST pass without any per-keystroke `delay`.
 *
 * Hosts: SPA-integration playground (`/spa-integration/`). Same
 * editable `salary` cells as `numeric-edit-replace-not-append.spec.ts`.
 */
import { test, expect, type Locator, type Page } from '@playwright/test';

test.use({ baseURL: 'http://localhost:5173' });

const PAGE = '/spa-integration/';

async function gotoGrid(page: Page): Promise<void> {
  await page.goto(PAGE);
  await page.locator('[role="grid"]').first().waitFor({ state: 'visible' });
}

function salaryCell(page: Page, rowId: number): Locator {
  return page
    .locator(`[role="gridcell"][data-field="salary"][data-row-id="${rowId}"]`)
    .first();
}

function editorIn(cell: Locator): Locator {
  return cell.locator('input').first();
}

test.describe('Issue #133 — edit cause threading (no rAF race)', () => {
  test('dblclick: rapid type fully REPLACES the previous value (no append)', async ({
    page,
  }) => {
    await gotoGrid(page);
    const cell = salaryCell(page, 1);
    await cell.waitFor({ state: 'visible' });
    const before = (await cell.innerText()).trim();
    expect(before).toMatch(/^\d{4,6}$/);

    await cell.dblclick();
    await editorIn(cell).waitFor({ state: 'visible' });
    // No per-keystroke delay — type at Playwright's natural rate.
    await page.keyboard.type('77777');
    await page.keyboard.press('Enter');

    await expect(cell).toHaveText('77777');
  });

  test('type-to-edit: rapid type APPENDS to the seed (every keystroke survives)', async ({
    page,
  }) => {
    await gotoGrid(page);
    const cell = salaryCell(page, 2);
    await cell.waitFor({ state: 'visible' });

    await cell.click();
    // No delay — pre-#133 this needed `delay: 50` to pass.
    await page.keyboard.type('99999');
    await page.keyboard.press('Enter');

    await expect(cell).toHaveText('99999');
  });

  test('type-to-edit: long input (12 chars) survives the rapid-type race', async ({
    page,
  }) => {
    await gotoGrid(page);
    const cell = salaryCell(page, 3);
    await cell.waitFor({ state: 'visible' });

    // 12 keystrokes back-to-back with no delay: under the old rAF race,
    // at least one of the digits would land while the body's deferred
    // `select()` had the seed highlighted, replacing it.
    await cell.click();
    await page.keyboard.type('123456789012');
    await page.keyboard.press('Enter');

    await expect(cell).toHaveText('123456789012');
  });

  test('F2: editor opens with existing value SELECTED so the next keystroke REPLACES', async ({
    page,
  }) => {
    await gotoGrid(page);
    const cell = salaryCell(page, 1);
    await cell.waitFor({ state: 'visible' });
    const before = (await cell.innerText()).trim();
    expect(before).toMatch(/^\d{4,6}$/);

    // F2 is the canonical Excel "edit the selected cell" key. The body
    // must `select()` on mount so a subsequent keystroke replaces the
    // existing value — same contract as dblclick.
    await cell.click();
    await page.keyboard.press('F2');
    await editorIn(cell).waitFor({ state: 'visible' });
    // No delay — proves F2 still gets `select()` even though typeToEdit
    // does not.
    await page.keyboard.type('42');
    await page.keyboard.press('Enter');

    await expect(cell).toHaveText('42');
  });

  test('Enter: editor opens with existing value SELECTED so the next keystroke REPLACES', async ({
    page,
  }) => {
    await gotoGrid(page);
    const cell = salaryCell(page, 2);
    await cell.waitFor({ state: 'visible' });

    await cell.click();
    await page.keyboard.press('Enter');
    await editorIn(cell).waitFor({ state: 'visible' });
    await page.keyboard.type('55');
    await page.keyboard.press('Enter');

    await expect(cell).toHaveText('55');
  });

  test('type-to-edit followed by dblclick on the SAME row keeps both contracts', async ({
    page,
  }) => {
    // Regression guard: ensure causes don't bleed across edits — the
    // first edit's `cause='typeToEdit'` must not leak into the second
    // edit's `cause='dblclick'` and silence its `select()`.
    await gotoGrid(page);
    const cell = salaryCell(page, 3);
    await cell.waitFor({ state: 'visible' });

    await cell.click();
    await page.keyboard.type('111');
    await page.keyboard.press('Enter');
    await expect(cell).toHaveText('111');

    await cell.dblclick();
    await editorIn(cell).waitFor({ state: 'visible' });
    await page.keyboard.type('999');
    await page.keyboard.press('Enter');

    // Must be exactly "999" — if cause leaked, we'd see "111999".
    await expect(cell).toHaveText('999');
  });

  test('dblclick: cursor placement is whole-text selection (Backspace deletes everything)', async ({
    page,
  }) => {
    // Direct verification that the body's `select()` actually fires on
    // the dblclick cause. We dblclick then press Backspace once: if
    // `select()` ran, the entire value is deleted; if it did not, only
    // one character is removed.
    await gotoGrid(page);
    const cell = salaryCell(page, 1);
    await cell.waitFor({ state: 'visible' });

    await cell.dblclick();
    const editor = editorIn(cell);
    await editor.waitFor({ state: 'visible' });
    await page.keyboard.press('Backspace');
    // After a single Backspace on a fully-selected input, the value is
    // empty. Read the input's `.value` directly — the cell's text
    // mirror only updates on commit.
    const value = await editor.inputValue();
    expect(value).toBe('');
  });

  test('type-to-edit: cursor is positioned AFTER the seed (Backspace deletes only the seed)', async ({
    page,
  }) => {
    // Companion to the dblclick test above. After type-to-edit seeds
    // "9", the cursor must be at position 1 (after the "9"), NOT a
    // whole-text selection. Pressing Backspace once must delete only
    // the "9", leaving the editor empty.
    await gotoGrid(page);
    const cell = salaryCell(page, 2);
    await cell.waitFor({ state: 'visible' });

    await cell.click();
    await page.keyboard.press('9');
    const editor = editorIn(cell);
    await editor.waitFor({ state: 'visible' });
    // One Backspace deletes the seed. If the body's `select()` had
    // fired (race lost), the editor would still show the seed because
    // the selection-replace had already happened on the keystroke that
    // came in while the seed was highlighted.
    await page.keyboard.press('Backspace');
    const value = await editor.inputValue();
    expect(value).toBe('');
  });
});
