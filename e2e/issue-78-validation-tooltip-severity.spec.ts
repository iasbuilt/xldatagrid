/**
 * End-to-end coverage for issue #78 — "Validation tooltip: severity icon +
 * red/yellow portal background".
 *
 * The companion spec `e2e/validation-tooltip.spec.ts` guards the broader
 * portal-rendering contract (target attributes, no-inline-alert, error-first
 * ordering). This file zeroes in on the issue-#78 visual contract:
 *
 *   - The tooltip portal has a **severity-keyed background colour** —
 *     red for `error`, yellow for `warning`, blue for `info` — sourced from
 *     the `--dg-validation-{error,warning,info}-bg` design token so the
 *     hue can be retinted without code changes. We assert against the
 *     hue family of the computed colour rather than a hex literal so the
 *     test stays valid through token-pack swaps.
 *   - The tooltip contains an **inline SVG severity icon** under
 *     `[data-icon="<severity>"] > svg`. The wrapping `data-icon`
 *     attribute is the load-bearing selector contract; the inner `<svg>`
 *     is what swaps in for the legacy unicode glyph per the issue.
 *
 * The `Default` story under `examples-validation-tooltip` already exposes a
 * cell wired to:
 *   - an error-severity validator on `email` (regex format check)
 *   - a warning-severity validator on `name` (`lettersOnly` rule)
 * The story does NOT include an info-severity validator, so this spec
 * exercises error + warning. Info coverage is exercised at the unit level
 * via `packages/react/src/__tests__/validation-tooltip.test.tsx`; adding an
 * info-severity validator to the shared story would have rippled into the
 * existing "two validators" contract assertion in the sibling spec, so we
 * deliberately keep the story shape stable here.
 */
import { test, expect, type Page } from '@playwright/test';

const STORY_URL =
  '/iframe.html?viewMode=story&id=examples-validation-tooltip--default';

async function waitForGrid(page: Page): Promise<void> {
  // First-hit storybook compilation can stretch past the 7.5s default expect
  // window; mirror the timeout used by the sibling validation-tooltip spec.
  await page
    .locator('[role="grid"]')
    .first()
    .waitFor({ state: 'visible', timeout: 30_000 });
}

function parseRgb(s: string): [number, number, number] | null {
  const m = s.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

// Hue-family probes — these intentionally match the same heuristics used by
// `e2e/validation-tooltip.spec.ts` so a token-pack swap that satisfies one
// spec satisfies the other too.
function isRedFamily([r, g, b]: [number, number, number]): boolean {
  return r > 180 && r > g + 40 && r > b + 40;
}
function isYellowFamily([r, g, b]: [number, number, number]): boolean {
  return r > 180 && g > 140 && b < 120;
}

async function commit(
  page: Page,
  rowId: string,
  field: string,
  value: string,
): Promise<void> {
  const cell = page
    .locator(`[role="gridcell"][data-row-id="${rowId}"][data-field="${field}"]`)
    .first();
  await cell.dblclick();
  const input = page.locator('input:focus, textarea:focus').first();
  await input.fill(value);
  await input.press('Enter');
}

function tooltipFor(page: Page, rowId: string, field: string) {
  return page
    .locator(`[role="tooltip"][data-validation-target="${rowId}:${field}"]`)
    .first();
}

test.describe('Issue #78 — validation tooltip severity icon + portal bg', () => {
  // Bump the per-test budget so a cold Storybook (lazy story compile on
  // first navigation, can stretch past the default 30s for a fresh worker)
  // does not flake out the visual-contract assertions.
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    await page.goto(STORY_URL, { timeout: 60_000 });
    await waitForGrid(page);
  });

  test('error severity: red portal background + inline SVG error icon', async ({
    page,
  }) => {
    // Email column is wired with an error-severity regex validator in the
    // shared story; entering a non-email value triggers it.
    await commit(page, '1', 'email', 'not-an-email');

    const tip = tooltipFor(page, '1', 'email');
    await expect(tip).toBeVisible();
    await expect(tip).toHaveAttribute('data-validation-severity', 'error');

    // Background lives in the red family (issue-#78 contract — token-driven,
    // so we probe the resolved colour rather than a hex literal).
    const bg = await tip.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    const rgb = parseRgb(bg);
    expect(rgb, `expected an rgb-ish background, got "${bg}"`).not.toBeNull();
    expect(
      isRedFamily(rgb!),
      `expected red-family background, got rgb(${rgb!.join(', ')})`,
    ).toBe(true);

    // Inline SVG severity icon, wrapped in the load-bearing data-icon span.
    const icon = tip.locator('[data-icon="error"]');
    await expect(icon).toHaveCount(1);
    await expect(icon.locator('svg')).toHaveCount(1);
  });

  test('warning severity: yellow portal background + inline SVG warning icon', async ({
    page,
  }) => {
    // The `name` column has a warning-severity letters-only rule; committing
    // digits triggers warning without tripping the minLength error rule.
    await commit(page, '1', 'name', 'Alice99');

    const tip = tooltipFor(page, '1', 'name');
    await expect(tip).toBeVisible();
    await expect(tip).toHaveAttribute('data-validation-severity', 'warning');

    const bg = await tip.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    const rgb = parseRgb(bg);
    expect(rgb, `expected an rgb-ish background, got "${bg}"`).not.toBeNull();
    expect(
      isYellowFamily(rgb!),
      `expected yellow-family background, got rgb(${rgb!.join(', ')})`,
    ).toBe(true);

    const icon = tip.locator('[data-icon="warning"]');
    await expect(icon).toHaveCount(1);
    await expect(icon.locator('svg')).toHaveCount(1);
  });

  test('icon swaps to error when both error + warning fire on the same cell', async ({
    page,
  }) => {
    // The story's `name` column carries both a minLength (error) and a
    // letters-only (warning) validator. The digits-only short value "1"
    // fails both — the icon must render as `error` (most-severe wins) so the
    // visual badge matches the colour-coded surface.
    await commit(page, '1', 'name', '1');

    const tip = tooltipFor(page, '1', 'name');
    await expect(tip).toBeVisible();
    await expect(tip).toHaveAttribute('data-validation-severity', 'error');

    const bg = await tip.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    const rgb = parseRgb(bg);
    expect(rgb).not.toBeNull();
    expect(isRedFamily(rgb!)).toBe(true);

    await expect(tip.locator('[data-icon="error"]')).toHaveCount(1);
    await expect(tip.locator('[data-icon="error"] svg')).toHaveCount(1);
    // No warning icon should be present alongside — the top-severity wins.
    await expect(tip.locator('[data-icon="warning"]')).toHaveCount(0);
  });
});
