/**
 * End-to-end: full row-select VISUAL STACK as described in issue #75 — the
 * three coordinated colour layers that Excel 365 paints when a row is selected
 * from its row-number gutter.
 *
 * Spec contract (mirrors `e2e/row-select-styling.spec.ts` but pins explicit
 * computed-style values for each layer rather than just luminance ordering):
 *
 *   1. Column-header strip darkens to `--dg-header-selected-bg`.
 *   2. The clicked row-number cell paints `--dg-row-number-selected-bg`
 *      (semi-transparent blue, alpha < 1).
 *   3. The body cells in that row paint `--dg-row-selected-bg`
 *      (deeper semi-transparent blue, also alpha < 1 and DARKER than the
 *      gutter tint when composited against white).
 *
 * Both the light and dark theme variants are exercised so the
 * `lightThemeTokens` / `darkThemeTokens` projection in
 * `packages/react/src/styles/tokens/index.ts` stays in sync with the
 * stylesheet defaults in `packages/react/src/styles/datagrid-theme.css`.
 *
 * Test names include `(#75)` per the issue's contract.
 */
import { test, expect, type Locator, type Page } from '@playwright/test';

const STORY_URL =
  '/iframe.html?viewMode=story&id=examples-chrome-columns--row-numbers-only';

/**
 * Wait for the grid to be visible. Storybook cold-start (Vite dep-discovery,
 * MUI bundle eval) can exceed Playwright's default 7.5s actionTimeout on a
 * fresh worker, so widen the visibility wait. Hot navigations finish in well
 * under a second.
 */
async function waitForGrid(page: Page): Promise<void> {
  await page
    .locator('[role="grid"]').first()
    .waitFor({ state: 'visible', timeout: 30_000 });
}

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

function parseRgba(s: string): Rgba | null {
  if (!s || s === 'transparent') return null;
  const m = s.match(
    /rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?/,
  );
  if (!m) return null;
  return {
    r: Number(m[1]),
    g: Number(m[2]),
    b: Number(m[3]),
    a: m[4] !== undefined ? Number(m[4]) : 1,
  };
}

/**
 * sRGB-relative luminance (WCAG 2.0). Used by the visual-stack contract:
 * `luminance(data-cell) < luminance(row-number)` is what makes the data
 * tint read as "darker / focal" than the gutter tint.
 */
function luminance(c: Rgba): number {
  const toLinear = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(c.r) + 0.7152 * toLinear(c.g) + 0.0722 * toLinear(c.b);
}

/** Blue-family heuristic — B channel dominant, R/G notably lower. */
function isBlueFamily(c: Rgba): boolean {
  return c.a > 0 && c.b > 120 && c.b > c.r + 20 && c.b > c.g + 10;
}

async function computedBg(locator: Locator): Promise<string> {
  return locator.evaluate((el) => getComputedStyle(el).backgroundColor);
}

function headerSample(page: Page): Locator {
  return page.locator('[role="columnheader"]').first();
}

function rowNumberCell(page: Page, rowIndex: number): Locator {
  return page.locator('[data-chrome="row-number"]').nth(rowIndex);
}

function dataCell(page: Page, rowIndex: number): Locator {
  return page
    .locator('[role="row"]')
    .nth(rowIndex + 1 /* skip header row */)
    .locator('[role="gridcell"]:not([data-chrome])')
    .first();
}

/**
 * Drive the row-select visual stack and return the three layer backgrounds.
 * Encapsulated so the light and dark describes can share the click + measure
 * dance without copy/pasting it.
 */
async function captureStack(page: Page): Promise<{
  resting: { header: Rgba | null };
  selected: { header: Rgba | null; rowNumber: Rgba | null; data: Rgba | null };
}> {
  const header = headerSample(page);
  const restingHeader = parseRgba(await computedBg(header));

  await rowNumberCell(page, 0).click();
  await expect(dataCell(page, 0)).toHaveAttribute('aria-selected', 'true');

  return {
    resting: { header: restingHeader },
    selected: {
      header: parseRgba(await computedBg(header)),
      rowNumber: parseRgba(await computedBg(rowNumberCell(page, 0))),
      data: parseRgba(await computedBg(dataCell(page, 0))),
    },
  };
}

test.describe('issue-75 row-select visual stack — light theme (#75)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(STORY_URL);
    await waitForGrid(page);
  });

  test('row-select-visual-stack: header / row-number / cell tints paint together in light theme (#75)', async ({
    page,
  }) => {
    const { resting, selected } = await captureStack(page);

    // 1. Header darkens.
    expect(resting.header, 'light: header resting bg').not.toBeNull();
    expect(selected.header, 'light: header selected bg').not.toBeNull();
    expect(
      luminance(selected.header!),
      'light: header must darken (lower luminance) on row-select',
    ).toBeLessThan(luminance(resting.header!));

    // 2. Row-number gutter cell paints a semi-transparent blue.
    expect(selected.rowNumber, 'light: row-number selected bg').not.toBeNull();
    expect(
      isBlueFamily(selected.rowNumber!),
      `light: row-number tint must be blue-family; got ${JSON.stringify(selected.rowNumber)}`,
    ).toBe(true);
    expect(selected.rowNumber!.a, 'light: row-number tint must be semi-transparent (alpha < 1)').toBeLessThan(1);
    expect(selected.rowNumber!.a).toBeGreaterThan(0);

    // 3. Data cell paints a darker blue than the row-number cell.
    expect(selected.data, 'light: data cell selected bg').not.toBeNull();
    expect(
      isBlueFamily(selected.data!),
      `light: data cell tint must be blue-family; got ${JSON.stringify(selected.data)}`,
    ).toBe(true);
    expect(selected.data!.a, 'light: data-cell tint must be semi-transparent (alpha < 1)').toBeLessThan(1);
    expect(
      luminance(selected.data!),
      'light: data cell tint must be DARKER (lower luminance) than the gutter tint',
    ).toBeLessThan(luminance(selected.rowNumber!));
  });

  test('row-select-visual-stack: every column header darkens uniformly in light theme (#75)', async ({
    page,
  }) => {
    // Capture every header's resting bg, click a row, then re-read and
    // assert that every header darkened. This is what makes the strip read
    // as a single coherent state rather than just the first cell repainting.
    const headers = await page.locator('[role="columnheader"]').all();
    expect(headers.length).toBeGreaterThan(1);
    const restings: Rgba[] = [];
    for (const h of headers) {
      const bg = parseRgba(await computedBg(h));
      expect(bg).not.toBeNull();
      restings.push(bg!);
    }

    await rowNumberCell(page, 0).click();

    for (let i = 0; i < headers.length; i++) {
      const selected = parseRgba(await computedBg(headers[i]));
      expect(selected, `header[${i}] selected bg`).not.toBeNull();
      expect(
        luminance(selected!),
        `header[${i}] must darken on row-select`,
      ).toBeLessThan(luminance(restings[i]));
    }
  });
});

test.describe('issue-75 row-select visual stack — dark theme (#75)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(STORY_URL);
    // Flip the theme before measuring; the grid reads `data-theme` from
    // either `<html>` or `<body>` depending on host wiring.
    await page.evaluate(() => {
      document.body.setAttribute('data-theme', 'dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    await waitForGrid(page);
  });

  test('row-select-visual-stack: header / row-number / cell tints paint together in dark theme (#75)', async ({
    page,
  }) => {
    const { resting, selected } = await captureStack(page);

    // 1. Header BRIGHTENS in dark mode (the contrast direction inverts so
    // the "selected" surface still reads as raised against the resting
    // surface).
    expect(resting.header, 'dark: header resting bg').not.toBeNull();
    expect(selected.header, 'dark: header selected bg').not.toBeNull();
    expect(
      luminance(selected.header!),
      'dark: header must brighten (higher luminance) on row-select',
    ).toBeGreaterThan(luminance(resting.header!));

    // 2. Row-number gutter cell — same blue-family + semi-transparent
    // contract, independent of theme.
    expect(selected.rowNumber, 'dark: row-number selected bg').not.toBeNull();
    expect(
      isBlueFamily(selected.rowNumber!),
      `dark: row-number tint must be blue-family; got ${JSON.stringify(selected.rowNumber)}`,
    ).toBe(true);
    expect(selected.rowNumber!.a).toBeLessThan(1);
    expect(selected.rowNumber!.a).toBeGreaterThan(0);

    // 3. Data cell — darker than gutter, blue-family, semi-transparent.
    expect(selected.data, 'dark: data cell selected bg').not.toBeNull();
    expect(
      isBlueFamily(selected.data!),
      `dark: data cell tint must be blue-family; got ${JSON.stringify(selected.data)}`,
    ).toBe(true);
    expect(selected.data!.a).toBeLessThan(1);
    expect(
      luminance(selected.data!),
      'dark: data cell tint must be DARKER than the gutter tint',
    ).toBeLessThan(luminance(selected.rowNumber!));
  });
});
