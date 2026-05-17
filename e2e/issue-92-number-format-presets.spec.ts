/**
 * End-to-end coverage for issue #92 — Excel-style number-format presets and
 * the optional dual-unit sub-cell on the numeric cell type.
 *
 * Stories:
 *   - `examples-number-format--presets`        (Excel-style presets)
 *   - `examples-number-format--secondary-unit` (dual-unit weight column)
 *
 * Each formatted cell is cross-checked against the expected
 * `Intl.NumberFormat` output computed in-test so the spec is robust to
 * locale drift in the host environment while still pinning the structural
 * shape of every preset.
 */
import { test, expect, type Page } from '@playwright/test';

const PRESETS_URL = '/iframe.html?viewMode=story&id=examples-number-format--presets';
const SECONDARY_UNIT_URL = '/iframe.html?viewMode=story&id=examples-number-format--secondary-unit';

async function waitForGrid(page: Page): Promise<void> {
  await page.locator('[role="grid"]').first().waitFor({ state: 'visible' });
}

function cell(page: Page, field: string, rowId: string) {
  return page.locator(`[role="gridcell"][data-field="${field}"][data-row-id="${rowId}"]`).first();
}

test.describe('Issue #92 — Excel-style number-format presets', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PRESETS_URL);
    await waitForGrid(page);
  });

  test('thousands preset matches Intl.NumberFormat output', async ({ page }) => {
    const expected = new Intl.NumberFormat().format(1234567);
    await expect(cell(page, 'thousands', '1')).toHaveText(expected);
  });

  test('currency preset renders the expected USD string', async ({ page }) => {
    const expected = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(1234.5);
    await expect(cell(page, 'currency', '1')).toHaveText(expected);
  });

  test('percent preset honours the 1-decimal config and treats value as a ratio', async ({ page }) => {
    const expected = new Intl.NumberFormat('en-US', {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }).format(0.25);
    await expect(cell(page, 'percent', '1')).toHaveText(expected);
  });

  test('accounting preset wraps negatives in parentheses', async ({ page }) => {
    const text = (await cell(page, 'accounting', '1').innerText()).trim();
    // -1000 USD in accounting style ⇒ parens around a USD amount.
    expect(text).toMatch(/^\(.*1,000.*\)$/);
    expect(text).toContain('$');
  });

  test('scientific preset uses uppercase E exponent', async ({ page }) => {
    await expect(cell(page, 'scientific', '1')).toHaveText('1.23E5');
  });

  test('fixed preset honours the requested decimal count with no grouping', async ({ page }) => {
    await expect(cell(page, 'fixed', '1')).toHaveText('3.142');
  });

  test('editing a preset cell reformats display after commit', async ({ page }) => {
    const target = cell(page, 'thousands', '2');
    await target.scrollIntoViewIfNeeded();
    await target.dblclick();
    const input = page.locator('[role="gridcell"][data-field="thousands"][data-row-id="2"] input').first();
    await input.waitFor({ state: 'visible' });
    // Wait for the deferred `select()` to run so the first keystroke replaces
    // the existing text rather than racing the focus/select effect.
    await input.focus();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type('9876543');
    await page.keyboard.press('Enter');
    const expected = new Intl.NumberFormat().format(9876543);
    await expect(target).toHaveText(expected);
  });
});

test.describe('Issue #92 — Dual-unit sub-cell', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(SECONDARY_UNIT_URL);
    await waitForGrid(page);
  });

  test('renders both primary and secondary unit lines with the converted value', async ({ page }) => {
    const target = cell(page, 'weight_kg', '1');
    const primary = target.locator('[data-testid="numeric-primary"]');
    const secondary = target.locator('[data-testid="numeric-secondary"]');

    // Primary: fixed(1 dp) of 100 → "100.0"
    await expect(primary).toHaveText('100.0');
    // Secondary: 100 kg * 2.20462 = 220.462 → fixed(2 dp) "220.46 lb"
    await expect(secondary).toHaveText('220.46 lb');
  });

  test('secondary line updates after a primary-value edit', async ({ page }) => {
    const target = cell(page, 'weight_kg', '2');
    await target.scrollIntoViewIfNeeded();
    await target.dblclick();
    const input = page.locator('[role="gridcell"][data-field="weight_kg"][data-row-id="2"] input').first();
    await input.waitFor({ state: 'visible' });
    await page.keyboard.type('10');
    await page.keyboard.press('Enter');

    const primary = target.locator('[data-testid="numeric-primary"]');
    const secondary = target.locator('[data-testid="numeric-secondary"]');
    await expect(primary).toHaveText('10.0');
    // 10 kg * 2.20462 = 22.0462 → fixed(2 dp) ⇒ "22.05 lb"
    await expect(secondary).toHaveText('22.05 lb');
  });

  test('edit mode shows a single input (no secondary line in the editor)', async ({ page }) => {
    const target = cell(page, 'weight_kg', '1');
    await target.dblclick();
    const input = page.locator('[role="gridcell"][data-field="weight_kg"][data-row-id="1"] input').first();
    await input.waitFor({ state: 'visible' });
    // While editing, the dual-unit wrapper is replaced by the bare editor.
    await expect(target.locator('[data-testid="numeric-secondary"]')).toHaveCount(0);
  });
});
