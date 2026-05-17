/**
 * End-to-end coverage for issue #81 — RichText cell: portaled floating
 * formatting toolbar + "Show formatting" toggle + keyboard shortcuts.
 *
 * Companion to `rich-text-floating-menu.spec.ts` (the original spec authored
 * with the issue), this file extends coverage to the additional surfaces
 * called out in the implementation brief:
 *
 *   1. Portal placement — `[role="toolbar"][data-floating-menu]` lives at
 *      `document.body`, not inside the cell. (Cross-checks the original.)
 *   2. Show-formatting toggle — flipping the toggle ON surfaces raw markdown
 *      delimiters in the editor's visible text.
 *   3. Keyboard shortcuts — Ctrl/Cmd+B wraps the selection in `**...**` in
 *      the underlying draft buffer (the canonical `<textarea>` mirror).
 *   4. Right-edge alignment — when the cell sits near the viewport right
 *      edge, the toolbar shifts left (`data-align="right"`).
 *
 * Drives the `Examples/Cell Types → AllCellTypes` story rendered by the
 * MuiDataGrid (see `stories/CellTypes.stories.tsx`).
 */
import { test, expect, type Locator, type Page } from '@playwright/test';

const CELL_TYPES_URL =
  '/iframe.html?viewMode=story&id=examples-cell-types--all-cell-types';

function richTextCell(page: Page, rowId: string): Locator {
  return page.locator(
    `[role="gridcell"][data-row-id="${rowId}"][data-field="richText"]`,
  );
}

async function enterEditMode(cell: Locator): Promise<void> {
  await cell.dblclick();
  await cell
    .locator('textarea, [contenteditable="true"]')
    .first()
    .waitFor({ state: 'visible' });
}

test.describe('issue #81 — RichText floating toolbar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(CELL_TYPES_URL);
    await page.locator('[role="grid"]').first().waitFor({ state: 'visible' });
  });

  test('floating toolbar mounts via portal at document.body (not inside the cell)', async ({
    page,
  }) => {
    const cell = richTextCell(page, '2');
    await enterEditMode(cell);

    const menu = page.locator('[role="toolbar"][data-floating-menu]');
    await expect(menu).toHaveCount(1);
    await expect(menu).toBeVisible();

    // Toolbar must not be a descendant of the cell, AND its closest fixed-
    // position ancestor should be <body> — i.e. it was portaled out, not
    // merely position:fixed inside the cell stacking context.
    const result = await cell.evaluate((cellEl) => {
      const toolbar = document.querySelector(
        '[role="toolbar"][data-floating-menu]',
      ) as HTMLElement | null;
      return {
        descendantOfCell: toolbar ? cellEl.contains(toolbar) : null,
        parentTag: toolbar?.parentElement?.tagName?.toLowerCase() ?? null,
      };
    });
    expect(result.descendantOfCell).toBe(false);
    // Portal target is `document.body`, so the toolbar's parent is BODY.
    expect(result.parentTag).toBe('body');
  });

  test('"Show formatting" toggle reveals raw markdown delimiters in the editor', async ({
    page,
  }) => {
    const cell = richTextCell(page, '2');
    await enterEditMode(cell);

    const menu = page.locator('[role="toolbar"][data-floating-menu]');
    const toggle = menu.getByRole('button', { name: /show formatting/i });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');

    const editor = cell.locator('[contenteditable="true"]').first();
    // Seed a deterministic markdown payload — the textarea mirror is the
    // canonical source of truth so we drive that and let the editor surface
    // re-project the visible text.
    const textarea = cell.locator('textarea').first();
    await textarea.fill('**emphasis** check');

    // Toggle OFF: delimiters NOT in visible text (default behaviour).
    expect(((await editor.innerText()) ?? '').includes('**')).toBe(false);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');

    // Toggle ON: delimiters ARE in visible text.
    const visibleAfter = (await editor.innerText()) ?? '';
    expect(
      visibleAfter.includes('**'),
      `editor must show raw ** delimiters when toggle is ON; got ${JSON.stringify(visibleAfter)}`,
    ).toBe(true);
    expect(visibleAfter).toContain('emphasis');
  });

  test('Ctrl+B wraps the selection in ** in the textarea buffer', async ({
    page,
  }) => {
    const cell = richTextCell(page, '1');
    await enterEditMode(cell);

    // The keyboard shortcut handler is bound to BOTH the contenteditable and
    // the textarea (`onKeyDown={handleKeyDown}` on each surface in
    // `MuiRichTextCell.tsx`). Drive the textarea directly — it's the
    // canonical raw-markdown source and has a stable text-selection API.
    const textarea = cell.locator('textarea').first();
    await textarea.fill('emphasis');
    // Force a deterministic selection range over the full draft. Pressing
    // `Control+a` in a textarea is the more idiomatic gesture, but on
    // platforms where the menu shortcut is `Cmd+a` the selection can fail
    // to land — set the range explicitly to keep this assertion focused on
    // the transform behaviour, not the platform-specific select-all hotkey.
    await textarea.evaluate((el: HTMLTextAreaElement) => {
      el.focus();
      el.setSelectionRange(0, el.value.length);
    });
    await textarea.press('Control+b');

    // After Ctrl+B the textarea draft must be wrapped in `**...**`.
    await expect(textarea).toHaveValue('**emphasis**');
  });

  test('cell near right viewport edge anchors the toolbar to the right', async ({
    page,
  }) => {
    // The story renders a horizontally-scrolling grid; the richText column
    // sits near the right. Pick a cell, scroll its right edge close to the
    // viewport's right edge, and confirm the toolbar flips alignment.
    const cell = richTextCell(page, '1');
    await cell.scrollIntoViewIfNeeded();
    // Pin the cell's right edge close to the viewport's right edge so the
    // alignment heuristic (EDGE_ALIGN_MARGIN px in the component) fires.
    await cell.evaluate((el) => {
      // Anchor the cell's right edge against the viewport right edge.
      el.scrollIntoView({ inline: 'end', block: 'center' });
    });

    await enterEditMode(cell);

    const menu = page.locator('[role="toolbar"][data-floating-menu]');
    await expect(menu).toBeVisible();
    // Alignment surfaces as data-align="right" when the cell is close to
    // the viewport's right edge.
    await expect(menu).toHaveAttribute('data-align', 'right');

    // Sanity: confirm the toolbar's right-edge sits within the viewport
    // (it wouldn't if alignment hadn't flipped).
    const overflow = await menu.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.right - window.innerWidth;
    });
    expect(overflow).toBeLessThanOrEqual(2);
  });
});
