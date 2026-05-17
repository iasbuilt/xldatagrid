/**
 * End-to-end regression: dblclick → type on a numeric cell must REPLACE
 * the value, not APPEND digits.
 *
 * The bug ("Salary calculations in playground seem to be broken — calculates
 * a gigantic number") was caused by the default inline `<input>` editor in
 * `DataGridBody.tsx`. `autoFocus` left the cursor at the end of the text
 * and typing appended — turning a $138,739 salary into $13,873,977,777 in
 * one user gesture. Aggregations downstream then displayed those
 * "gigantic numbers."
 *
 * The unit test path in `packages/react/src/cells/NumericCell/__tests__/`
 * couldn't catch this because the actual editor that ships in the
 * default `DataGrid` body is the inline `<input>`, not `NumericCell`.
 * Only a real-DOM browser test reproduces the focus/select race.
 *
 * Hosts: the SPA-integration playground at /spa-integration/.
 */
import { test, expect } from '@playwright/test';

test.use({ baseURL: 'http://localhost:5173' });

const PAGE = '/spa-integration/';

test('numeric cell: dblclick then type REPLACES the value (does not append)', async ({ page }) => {
  await page.goto(PAGE);
  await page.locator('[role="grid"]').first().waitFor({ state: 'visible' });

  const cell = page.locator('[role="gridcell"][data-field="salary"][data-row-id="1"]').first();
  await cell.waitFor({ state: 'visible' });
  const before = (await cell.innerText()).trim();
  expect(before).toMatch(/^\d{4,6}$/);   // 5–6 digit baseline salary

  await cell.dblclick();
  // Wait for the input to mount; rAF-deferred select() runs immediately after.
  const input = page.locator('[role="gridcell"][data-field="salary"][data-row-id="1"] input').first();
  await input.waitFor({ state: 'visible' });
  await page.keyboard.type('77777');
  await page.keyboard.press('Enter');

  // The cell must show exactly the typed value — NOT before + after concatenated.
  await expect(cell).toHaveText('77777');
});

test('numeric cell: type-to-edit (no dblclick) appends to the typed seed', async ({ page }) => {
  await page.goto(PAGE);
  await page.locator('[role="grid"]').first().waitFor({ state: 'visible' });

  const cell = page.locator('[role="gridcell"][data-field="salary"][data-row-id="2"]').first();
  await cell.waitFor({ state: 'visible' });

  // Single-click to select the cell, then type-to-edit starting with "9".
  // Small per-keystroke delay so the type-to-edit handler's deferred
  // setSelectionRange (use-keyboard.ts) wins its race against
  // DataGridBody's deferred .select() — without it, the test is flaky
  // under high CPU contention (e.g. pre-push hook with two parallel
  // webServers).
  await cell.click();
  await page.keyboard.type('99999', { delay: 20 });
  await page.keyboard.press('Enter');

  // Type-to-edit must keep every typed character (we should see all 5 9s).
  await expect(cell).toHaveText('99999');
});
