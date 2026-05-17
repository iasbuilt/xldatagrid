/**
 * End-to-end: Tag-list cell — multi-select variant of the dropdown cell (#94).
 *
 * Story: `examples-cell-types--tags-multi-select` (see
 * `stories/CellTypes.stories.tsx`). Renders the React (non-MUI) DataGrid with
 * a `tags`-type column whose `options` list activates the multi-select picker
 * in `TagsCell`. Two rows are seeded — row 1 pre-selected with `frontend`,
 * row 2 empty.
 *
 * Contracts (all from the issue spec):
 *
 *   1. Double-click on the cell opens a checkbox picker. Selecting three
 *      options renders three chips in the cell after the user clicks outside
 *      (commit).
 *   2. Each rendered chip has a `×` button. Clicking it removes the chip
 *      from the cell value without re-opening the editor.
 *   3. Re-opening the picker shows the currently-selected options as checked.
 */
import { test, expect, type Locator, type Page } from '@playwright/test';

const STORY_URL =
  '/iframe.html?viewMode=story&id=examples-cell-types--tags-multi-select';

async function waitForGrid(page: Page): Promise<void> {
  await page.locator('[role="grid"]').first().waitFor({ state: 'visible' });
}

function labelsCell(page: Page, rowId: string): Locator {
  return page.locator(
    `[role="gridcell"][data-row-id="${rowId}"][data-field="labels"]`,
  );
}

test.describe('Tag-list multi-select cell (#94)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(STORY_URL);
    await waitForGrid(page);
  });

  test('multi-select three options renders three chips after commit (#94)', async ({ page }) => {
    // Row 2 starts empty — fresh selection from scratch.
    const cell = labelsCell(page, '2');
    await cell.dblclick();

    // Picker opens with a listbox of checkbox options.
    const listbox = cell.locator('[role="listbox"]');
    await expect(listbox).toBeVisible();

    // Tick three options.
    for (const value of ['frontend', 'backend', 'design']) {
      await cell.locator(`[data-testid="tag-option-${value}"] input[type="checkbox"]`).click();
    }

    // Click outside the cell to commit. We use the document body via a
    // coordinates click so we definitively land outside any popup.
    await page.mouse.click(2, 2);

    // After commit, the cell renders exactly three chips with the option
    // labels (not raw values). Editor must be gone.
    await expect(cell.locator('[role="listbox"]')).toHaveCount(0);
    await expect(cell.locator('[data-testid^="tag-chip-"]')).toHaveCount(3);
    await expect(cell.locator('[data-testid="tag-chip-frontend"]')).toBeVisible();
    await expect(cell.locator('[data-testid="tag-chip-backend"]')).toBeVisible();
    await expect(cell.locator('[data-testid="tag-chip-design"]')).toBeVisible();
  });

  test('chip × removes a chip and updates the cell value without opening the editor (#94)', async ({ page }) => {
    // Row 1 is seeded with one chip — add two more, commit, then remove one
    // via the × in display mode and assert the picker did not open.
    const cell = labelsCell(page, '1');
    await cell.dblclick();
    for (const value of ['backend', 'design']) {
      await cell.locator(`[data-testid="tag-option-${value}"] input[type="checkbox"]`).click();
    }
    await page.mouse.click(2, 2);

    await expect(cell.locator('[data-testid^="tag-chip-"]')).toHaveCount(3);

    // Click the × on the frontend chip. The button is inside the chip span
    // and `mousedown`-based to avoid focus thrash, so a plain click works.
    await cell.locator('[data-testid="tag-remove-frontend"]').click();

    // Chip is gone, picker did NOT open.
    await expect(cell.locator('[data-testid="tag-chip-frontend"]')).toHaveCount(0);
    await expect(cell.locator('[data-testid^="tag-chip-"]')).toHaveCount(2);
    await expect(cell.locator('[role="listbox"]')).toHaveCount(0);
  });

  test('re-opening the picker shows currently-selected options as checked (#94)', async ({ page }) => {
    // Seed two selections via the picker, commit, then re-open and verify
    // the corresponding checkboxes carry the `checked` attribute.
    const cell = labelsCell(page, '2');
    await cell.dblclick();
    for (const value of ['backend', 'qa']) {
      await cell.locator(`[data-testid="tag-option-${value}"] input[type="checkbox"]`).click();
    }
    await page.mouse.click(2, 2);
    await expect(cell.locator('[role="listbox"]')).toHaveCount(0);

    // Re-open the picker.
    await cell.dblclick();
    await expect(cell.locator('[role="listbox"]')).toBeVisible();

    // The previously-selected options must be checked; an unselected one
    // (`design`) must remain unchecked.
    await expect(
      cell.locator('[data-testid="tag-option-backend"] input[type="checkbox"]'),
    ).toBeChecked();
    await expect(
      cell.locator('[data-testid="tag-option-qa"] input[type="checkbox"]'),
    ).toBeChecked();
    await expect(
      cell.locator('[data-testid="tag-option-design"] input[type="checkbox"]'),
    ).not.toBeChecked();
  });
});
