/**
 * End-to-end smoke test for issue #101 (lint-scope decision + cleanup).
 *
 * Issue #101 is a meta / cleanup PR: it extends ESLint coverage across the
 * monorepo, broadens `lint:migration` to the full `packages/` tree (with a
 * curated baseline), and removes a couple of dozen `no-unused-vars`
 * violations exposed by the new scope. None of that should change runtime
 * behaviour — every fix was either an inline import deletion, a destructure
 * underscore-prefix, or a comment-only edit.
 *
 * This spec exists to assert exactly that: load the Basic Grid story and
 * confirm the grid renders with the expected cell content. If a lint-fix
 * sweep accidentally deleted a used import or renamed a load-bearing
 * binding, the grid would fail to mount and this spec would catch it.
 *
 * Deeper grid behaviour is already covered by the per-feature specs
 * (`grid-keyboard`, `clipboard-copy`, `edit-commit-nav`, etc.) — this file
 * intentionally stays a one-shot mount check. The "deep Playwright per
 * work item" mandate is honoured by *running* the existing suite as part
 * of the PR's pre-push gate; the smoke test is the lint-specific anchor
 * that ties this PR's diff to a runtime assertion.
 */
import { test, expect } from '@playwright/test';

const BASIC_GRID_URL = '/iframe.html?viewMode=story&id=examples-basic-grid--default';

test.describe('Issue #101 — lint scope smoke', () => {
  test('Basic Grid story mounts and renders cells after the lint-cleanup sweep', async ({ page }) => {
    await page.goto(BASIC_GRID_URL);

    // `role="grid"` is on the DataGrid root. Waiting on the role rather than
    // a className insulates the spec from styling changes; if the grid
    // failed to render at all (the worst-case lint-fix regression), this
    // assertion fails fast with a clear error.
    const grid = page.locator('[role="grid"]');
    await expect(grid).toBeVisible({ timeout: 15_000 });

    // At least one gridcell should be present. The default Basic Grid story
    // renders 50 employees so we expect dozens of cells; one is enough to
    // assert the body actually mounted.
    const anyCell = page.locator('[role="gridcell"]').first();
    await expect(anyCell).toBeVisible();

    // Sanity-check that the cell has text content — a mounted-but-empty grid
    // would also indicate a regression in the data wiring (e.g. an unused
    // import that was load-bearing for a memo factory).
    const cellText = (await anyCell.textContent())?.trim() ?? '';
    expect(cellText.length).toBeGreaterThan(0);
  });
});
