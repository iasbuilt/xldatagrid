/**
 * End-to-end: Issue #95 — compound-chip color sub-chip + picker + per-user
 * palette.
 *
 * Drives the `Examples/Cell Types → AllCellTypes` story, which contains a
 * `compoundChipList` column populated by `makeData()` in
 * `stories/CellTypes.stories.tsx`. The chips ship without colors, so the
 * sub-chip dots render in their empty-state and we have full freedom to
 * paint them via the picker UI.
 *
 * Contract covered:
 *   1. Display mode shows a color sub-chip per chip; empty-state by default.
 *   2. Clicking a sub-chip in edit mode opens the picker popover.
 *   3. Picking a theme swatch updates the chip's sub-chip color.
 *   4. Picking a custom hex (via the hex input + "Add to palette") fires the
 *      palette adapter's `write` callback.
 *   5. Reopening the picker shows the new custom color in the recently-used
 *      row — proving the read/write round-trip via the in-memory adapter.
 */
import { test, expect, type Locator, type Page } from '@playwright/test';

const CELL_TYPES_URL =
  '/iframe.html?viewMode=story&id=examples-cell-types--all-cell-types';

function chipCell(page: Page, rowId: string): Locator {
  return page.locator(
    `[role="gridcell"][data-row-id="${rowId}"][data-field="compoundChipList"]`,
  );
}

/**
 * Doubles-clicks a cell to enter edit mode and waits for the inline edit
 * surface to surface (the "+ Add" affordance is the most stable signal).
 */
async function enterEditMode(cell: Locator): Promise<void> {
  await cell.click();
  await cell.dblclick();
  // The MUI variant labels its add button by text ("+ Add"); the React
  // variant exposes an aria-label "Add item". Match either by widening the
  // regex to a substring of the visible label both share.
  await cell
    .getByRole('button', { name: /^\+\s*add$|add item/i })
    .first()
    .waitFor({ state: 'visible' });
}

test.describe('Issue #95 — compound-chip color sub-chip + picker', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(CELL_TYPES_URL);
    await page.locator('[role="grid"]').first().waitFor({ state: 'visible' });
  });

  test('display mode renders a color sub-chip per chip, in the empty state, when no colors are set', async ({ page }) => {
    const cell = chipCell(page, '1');
    await expect(cell).toBeVisible();
    // Two chips per row (see makeData() in stories/CellTypes.stories.tsx).
    const subChips = cell.locator('[data-color-sub-chip]');
    await expect(subChips).toHaveCount(2);
    // Empty-state encoded as data-color="" on the sub-chip.
    await expect(subChips.first()).toHaveAttribute('data-color', '');
    await expect(subChips.nth(1)).toHaveAttribute('data-color', '');
  });

  test('clicking a color sub-chip in edit mode opens the picker popover', async ({ page }) => {
    const cell = chipCell(page, '1');
    await enterEditMode(cell);
    const subChips = cell.locator('button[data-color-sub-chip]');
    await expect(subChips.first()).toBeVisible();
    // Use evaluate so the click goes straight to the React handler bypassing
    // any visual overlap with adjacent display-mode rows (the AllCellTypes
    // grid uses a fixed row height that the wrapping chip cell can overflow).
    await subChips.first().evaluate((el) => (el as HTMLButtonElement).click());
    await expect(page.getByRole('dialog', { name: /color picker/i })).toBeVisible();
  });

  test('picking a theme swatch updates the chip sub-chip and the cell commits', async ({ page }) => {
    const cell = chipCell(page, '1');
    await enterEditMode(cell);
    const subChips = cell.locator('button[data-color-sub-chip]');
    await subChips.first().evaluate((el) => (el as HTMLButtonElement).click());
    // Theme swatches default to DEFAULT_THEME_COLORS; the red one is #ef4444.
    const swatch = page.locator('[data-theme-swatch="#ef4444"]');
    await expect(swatch).toBeVisible();
    await swatch.click();
    // Picker closes after a pick.
    await expect(page.getByRole('dialog', { name: /color picker/i })).not.toBeVisible();
    // Sub-chip now carries the picked color.
    await expect(cell.locator('[data-color-sub-chip]').first()).toHaveAttribute(
      'data-color',
      '#ef4444',
    );
    // Commit the edit — Done button should be visible in the cell.
    await cell.getByRole('button', { name: /done/i }).click();
    // After commit we exit edit mode; the display sub-chip should still
    // carry the color we just picked.
    await expect(cell.locator('[data-color-sub-chip]').first()).toHaveAttribute(
      'data-color',
      '#ef4444',
    );
  });

  test('a custom hex color is round-tripped through the palette adapter and re-appears on reopen', async ({ page }) => {
    const cell = chipCell(page, '2');
    await enterEditMode(cell);

    // Open the picker on the first chip.
    const subChip = cell.locator('button[data-color-sub-chip]').first();
    await subChip.evaluate((el) => (el as HTMLButtonElement).click());
    await expect(page.getByRole('dialog', { name: /color picker/i })).toBeVisible();

    // Initially the palette is empty — the empty-state indicator is shown.
    await expect(page.locator('[data-color-picker-empty]')).toBeVisible();

    // Pick a custom hex via the input + Add to palette.
    const hexInput = page.locator('[data-color-picker-hex-input]');
    await hexInput.fill('#2563eb');
    await page.locator('[data-color-picker-add]').click();

    // Picker closes; the chip carries the new color.
    await expect(page.getByRole('dialog', { name: /color picker/i })).not.toBeVisible();
    await expect(cell.locator('[data-color-sub-chip]').first()).toHaveAttribute(
      'data-color',
      '#2563eb',
    );

    // Reopen — the in-memory adapter (per-cell default) should now report
    // the new custom color as a recently-used palette entry.
    await cell
      .locator('button[data-color-sub-chip]')
      .first()
      .evaluate((el) => (el as HTMLButtonElement).click());
    await expect(page.getByRole('dialog', { name: /color picker/i })).toBeVisible();
    await expect(page.locator('[data-palette-swatch="#2563eb"]')).toBeVisible();
  });
});
