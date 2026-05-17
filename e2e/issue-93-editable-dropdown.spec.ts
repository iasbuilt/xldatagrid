/**
 * End-to-end: editable status-dropdown contract (see GitHub #93).
 *
 * Contract (mirrors `packages/react/src/__tests__/status-cell-editable-dropdown.test.tsx`):
 *
 *   1. The dropdown surfaces an inline "Add new…" input. Typing a label
 *      and pressing Enter invokes `onAddOption(label)` and the new option
 *      appears in the listbox.
 *   2. Each option exposes a per-row × button when the consumer's
 *      `canDeleteOption` returns `true`; clicking × invokes
 *      `onDeleteOption(option)` and the row disappears from the listbox.
 *   3. When `canDeleteOption` returns `false`, the × button is NOT
 *      rendered (hidden, not merely disabled), and the keyboard Delete
 *      shortcut is a no-op.
 *
 * Stories under test live in `stories/EditableDropdown.stories.tsx`:
 *   AdminEditableDropdown  → editable-dropdown--admin-add-delete
 *   ViewerEditableDropdown → editable-dropdown--viewer-add-only
 *
 * The React `DataGrid` is used (not `MuiDataGrid`) — the editable-dropdown
 * UI is implemented in the React `StatusCell` renderer.
 */
import { test, expect, type Locator, type Page } from '@playwright/test';

const ADMIN_URL =
  '/iframe.html?viewMode=story&id=examples-editable-dropdown--admin-editable-dropdown';
const VIEWER_URL =
  '/iframe.html?viewMode=story&id=examples-editable-dropdown--viewer-editable-dropdown';

/** Wait for the React DataGrid to mount. */
async function waitForGrid(page: Page): Promise<void> {
  await page.locator('[role="grid"]').first().waitFor({ state: 'visible' });
}

/** Locate a status cell by row id (the story uses field=status, rowKey=id). */
function statusCell(page: Page, rowId: string): Locator {
  return page
    .locator(`[role="gridcell"][data-row-id="${rowId}"][data-field="status"]`)
    .first();
}

/** Double-click into a cell to begin editing, then assert the listbox shows. */
async function openDropdown(page: Page, cell: Locator): Promise<Locator> {
  await cell.click();
  await cell.dblclick();
  const listbox = page.locator('[role="listbox"]').first();
  await expect(listbox).toBeVisible();
  return listbox;
}

test.describe('Editable status dropdown (#93)', () => {
  test('admin: type a new option label + Enter appends the option to the dropdown', async ({
    page,
  }) => {
    await page.goto(ADMIN_URL);
    await waitForGrid(page);

    const cell = statusCell(page, 'r1');
    const listbox = await openDropdown(page, cell);

    // Add input is rendered when onAddOption is wired.
    const input = listbox.locator('[data-testid="add-option-input"]');
    await expect(input).toBeVisible();

    await input.fill('Archived');
    await input.press('Enter');

    // New option appears in the listbox.
    await expect(
      listbox.locator('[role="option"]', { hasText: 'Archived' }),
    ).toBeVisible();

    // Input cleared on success.
    await expect(input).toHaveValue('');
  });

  test('admin: hover an existing option → × button visible (canDeleteOption=true)', async ({
    page,
  }) => {
    await page.goto(ADMIN_URL);
    await waitForGrid(page);

    const cell = statusCell(page, 'r1');
    const listbox = await openDropdown(page, cell);

    // canDeleteOption returns true for every option — × button must exist
    // on every visible option (no hover gating in the React renderer).
    await expect(
      listbox.locator('[data-testid="delete-option-active"]'),
    ).toBeVisible();
    await expect(
      listbox.locator('[data-testid="delete-option-inactive"]'),
    ).toBeVisible();
    await expect(
      listbox.locator('[data-testid="delete-option-pending"]'),
    ).toBeVisible();
  });

  test('admin: click × removes the option from the dropdown', async ({
    page,
  }) => {
    await page.goto(ADMIN_URL);
    await waitForGrid(page);

    const cell = statusCell(page, 'r1');
    const listbox = await openDropdown(page, cell);

    // Sanity: option exists before delete.
    await expect(
      listbox.locator('[role="option"]', { hasText: 'Pending' }),
    ).toBeVisible();

    // The delete handler is wired to the parent state, so the option must
    // be gone from the rendered listbox after the click resolves.
    // We use a mousedown event (the cell uses onMouseDown to keep focus
    // on the listbox during deletion).
    await listbox
      .locator('[data-testid="delete-option-pending"]')
      .dispatchEvent('mousedown');

    await expect(
      listbox.locator('[role="option"]', { hasText: 'Pending' }),
    ).toHaveCount(0);
  });

  test('viewer: canDeleteOption=false → × button hidden for every option', async ({
    page,
  }) => {
    await page.goto(VIEWER_URL);
    await waitForGrid(page);

    const cell = statusCell(page, 'r1');
    const listbox = await openDropdown(page, cell);

    // None of the × buttons render in the viewer flavour.
    await expect(
      listbox.locator('[data-testid^="delete-option-"]'),
    ).toHaveCount(0);

    // The add input is still present — viewer can add but not delete.
    await expect(
      listbox.locator('[data-testid="add-option-input"]'),
    ).toBeVisible();
  });
});
