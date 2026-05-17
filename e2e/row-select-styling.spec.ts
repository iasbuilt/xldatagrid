/**
 * End-to-end: row-select visual state (header darken + row-number tint +
 * selected-row tint, across light and dark themes) (#75).
 *
 * Contract (see GitHub #75): clicking a chrome row-number cell must select
 * the entire row AND paint the Excel-style selection visual:
 *
 *   1. Every `[role="columnheader"]` cell darkens (lower luminance in light
 *      mode; higher luminance in dark mode) relative to its resting bg.
 *   2. The clicked row-number cell paints a blue-family, semi-transparent
 *      background.
 *   3. The selected row's data cells paint a darker blue than the row-
 *      number cell's tint.
 *   4. Deselecting reverts all three tints.
 *   5. The same invariants hold under `data-theme="dark"`.
 *
 * Story: `examples-chrome-columns--row-numbers-only` is the canonical
 * row-number story; the spec assumes the story's grid has
 * `selectionMode: 'row'` or equivalent. If not, the spec will fail on
 * the selection click too — implementation work may need to add a new
 * story like `Examples/Chrome Columns → RowSelectViaRowNumber`.
 *
 * Expected to FAIL today: no selection-linked visual state is wired up
 * beyond the selection border.
 */
import { test, expect, type Locator, type Page } from '@playwright/test';

const STORY_URL =
  '/iframe.html?viewMode=story&id=examples-chrome-columns--row-numbers-only';

async function waitForGrid(page: Page): Promise<void> {
  // Storybook cold-start with the MUI + chrome stack can exceed the default
  // 7.5s actionTimeout on a chilly local box, so widen the visibility wait
  // here. The grid render itself is sub-second once the bundle is hot; this
  // only matters on the first navigation of a worker.
  await page
    .locator('[role="grid"]')
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 });
}

function parseRgba(s: string): [number, number, number, number] | null {
  if (!s || s === 'transparent') return null;
  const m = s.match(
    /rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?/,
  );
  if (!m) return null;
  const a = m[4] !== undefined ? Number(m[4]) : 1;
  return [Number(m[1]), Number(m[2]), Number(m[3]), a];
}

function luminance([r, g, b]: [number, number, number, number]): number {
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

function isBlueFamily([r, g, b, a]: [number, number, number, number]): boolean {
  // Blue dominant; red/green both notably lower. The alpha must be > 0
  // (non-transparent) but the contract allows partial transparency so we
  // do NOT require alpha < 1 here — the caller checks semi-transparency
  // separately when needed.
  return a > 0 && b > 120 && b > r + 20 && b > g + 10;
}

async function computedBg(locator: Locator): Promise<string> {
  return locator.evaluate((el) => getComputedStyle(el).backgroundColor);
}

function headerBgSample(page: Page): Locator {
  return page.locator('[role="columnheader"]').first();
}

function rowNumberAt(page: Page, rowIndex: number): Locator {
  return page.locator('[data-chrome="row-number"]').nth(rowIndex);
}

function dataCellAt(page: Page, rowIndex: number): Locator {
  return page
    .locator('[role="row"]')
    .nth(rowIndex + 1 /* skip header row */)
    .locator('[role="gridcell"]:not([data-chrome])')
    .first();
}

async function assertSelectionTints({
  page,
  mode,
}: {
  page: Page;
  mode: 'light' | 'dark';
}): Promise<void> {
  const header = headerBgSample(page);
  const rowNumber = rowNumberAt(page, 0);
  const dataCell = dataCellAt(page, 0);

  // 1. Capture resting state.
  const headerResting = parseRgba(await computedBg(header));
  expect(headerResting, `${mode}: header must paint a resting bg`).not.toBeNull();

  // 2. Trigger selection.
  await rowNumber.click();
  await expect(dataCell).toHaveAttribute('aria-selected', 'true');

  // 3. Header darkens (light mode) / brightens (dark mode).
  const headerSelected = parseRgba(await computedBg(header));
  expect(headerSelected, `${mode}: header selected bg`).not.toBeNull();
  if (mode === 'light') {
    expect(
      luminance(headerSelected!),
      `${mode}: header must darken on row-select`,
    ).toBeLessThan(luminance(headerResting!));
  } else {
    expect(
      luminance(headerSelected!),
      `${mode}: header must brighten on row-select in dark theme`,
    ).toBeGreaterThan(luminance(headerResting!));
  }

  // 4. Row-number cell paints a blue-family, semi-transparent bg.
  const rowNumberBg = parseRgba(await computedBg(rowNumber));
  expect(rowNumberBg, `${mode}: row-number bg`).not.toBeNull();
  expect(
    isBlueFamily(rowNumberBg!),
    `${mode}: row-number tint must be in the blue family; got ${JSON.stringify(rowNumberBg)}`,
  ).toBe(true);

  // 5. Data cell paints a darker blue than the row-number cell.
  const dataBg = parseRgba(await computedBg(dataCell));
  expect(dataBg, `${mode}: data cell bg`).not.toBeNull();
  expect(
    isBlueFamily(dataBg!),
    `${mode}: selected-row data cell tint must be blue family; got ${JSON.stringify(dataBg)}`,
  ).toBe(true);
  expect(
    luminance(dataBg!),
    `${mode}: selected-row data cell must be DARKER than row-number tint`,
  ).toBeLessThan(luminance(rowNumberBg!));
}

test.describe('Row-select styling — light theme (#75)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(STORY_URL);
    await waitForGrid(page);
  });

  test('row-select-styling: clicking a row-number cell darkens all column header backgrounds (#75)', async ({
    page,
  }) => {
    const header = headerBgSample(page);
    const restingBg = parseRgba(await computedBg(header));
    expect(restingBg).not.toBeNull();

    await rowNumberAt(page, 0).click();

    const selectedBg = parseRgba(await computedBg(header));
    expect(selectedBg).not.toBeNull();
    expect(luminance(selectedBg!)).toBeLessThan(luminance(restingBg!));

    // And EVERY header darkens, not just the first — sample the next one.
    const otherHeader = page.locator('[role="columnheader"]').nth(1);
    if (await otherHeader.count()) {
      const otherBg = parseRgba(await computedBg(otherHeader));
      expect(otherBg).not.toBeNull();
      // The other header should also be darker than ITS own resting bg.
      // We approximate by asserting the luminance matches the first header
      // within a small tolerance — both darken by the same token.
      expect(Math.abs(luminance(otherBg!) - luminance(selectedBg!))).toBeLessThan(0.2);
    }
  });

  test('row-select-styling: the clicked row-number cell paints a semi-transparent blue background (#75)', async ({
    page,
  }) => {
    const rowNumber = rowNumberAt(page, 0);
    await rowNumber.click();

    const bg = parseRgba(await computedBg(rowNumber));
    expect(bg).not.toBeNull();
    expect(isBlueFamily(bg!), `bg must be in blue family; got ${JSON.stringify(bg)}`).toBe(true);
    // Semi-transparent: alpha strictly less than 1.
    expect(bg![3]).toBeLessThan(1);
    expect(bg![3]).toBeGreaterThan(0);
  });

  test('row-select-styling: the selected row\'s data cells paint a darker blue than the row-number tint (#75)', async ({
    page,
  }) => {
    const rowNumber = rowNumberAt(page, 0);
    await rowNumber.click();

    const rowNumberBg = parseRgba(await computedBg(rowNumber))!;
    const dataBg = parseRgba(await computedBg(dataCellAt(page, 0)))!;
    expect(isBlueFamily(dataBg)).toBe(true);
    expect(luminance(dataBg)).toBeLessThan(luminance(rowNumberBg));
  });

  test('row-select-styling: all three tints revert when selection is cleared (#75)', async ({
    page,
  }) => {
    const header = headerBgSample(page);
    const rowNumber = rowNumberAt(page, 0);
    const data = dataCellAt(page, 0);

    const headerResting = await computedBg(header);
    const rowNumberResting = await computedBg(rowNumber);
    const dataResting = await computedBg(data);

    await rowNumber.click();
    // Pressing Escape clears the selection in this grid's selection model.
    await page.keyboard.press('Escape');
    // Some implementations require clicking outside to clear — do both so
    // the test is robust to either behaviour.
    await page.locator('body').click({ position: { x: 1, y: 1 }, force: true });

    expect(await computedBg(header)).toBe(headerResting);
    expect(await computedBg(rowNumber)).toBe(rowNumberResting);
    expect(await computedBg(data)).toBe(dataResting);
  });
});

test.describe('Row-select styling — dark theme (#75)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(STORY_URL);
    // Flip the theme before measuring anything — the grid reads
    // `data-theme` from either `<html>` or `<body>` depending on wiring.
    await page.evaluate(() => {
      document.body.setAttribute('data-theme', 'dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    await waitForGrid(page);
  });

  test('row-select-styling: the tint-invariants still hold under data-theme="dark" (#75)', async ({
    page,
  }) => {
    await assertSelectionTints({ page, mode: 'dark' });
  });
});
