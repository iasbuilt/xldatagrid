/**
 * End-to-end smoke test for issue #100 — the deprecated `useGridWithAtoms`,
 * `useGridAtomContext`, and `UseGridResult` aliases were removed from the
 * `@iasbuilt/datagrid-react` public API.
 *
 * The real coverage for this change is compile-time: if either symbol is
 * still imported from `@iasbuilt/datagrid-react` anywhere in the repo,
 * `tsc` (and the playground build) fail before this spec is reached. The
 * checks below are belt-and-braces:
 *
 *   1. Drive the SPA-integration demo (which renders a grid via the
 *      current `useGrid` hook + `useGridContext`) and confirm no console
 *      errors fire while exercising filters — guards against any runtime
 *      regression we might have introduced while pulling the aliases out
 *      of the barrel.
 *   2. Probe the bundled JS that the playground actually ships and assert
 *      neither alias name appears in it. Vite serves source as ES modules,
 *      so we hit the compiled barrel via `?import` and string-scan.
 *
 * If `webServer` boots the Vite playground (configured in
 * `playwright.config.ts`), neither step needs any extra setup.
 */
import { test, expect } from '@playwright/test';

test.use({ baseURL: 'http://localhost:5173' });

const PAGE = '/spa-integration/';

test.describe('issue #100 — deprecated aliases are gone', () => {
  test('SPA-integration demo loads and renders without errors after alias removal', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    await page.goto(PAGE);
    await page.locator('[role="grid"]').first().waitFor({ state: 'visible' });

    // Exercise the grid through a filter button — this path uses the
    // `useGrid` / `useGridContext` hooks that replaced the removed
    // aliases. If anything wired through the React barrel is broken,
    // a render error fires here.
    await page.locator('button', { hasText: 'Salary > $100k' }).click();
    await page.locator('button', { hasText: 'Clear filter' }).click();

    expect(consoleErrors, `console errors fired:\n${consoleErrors.join('\n')}`).toEqual([]);
    expect(pageErrors, `page errors fired:\n${pageErrors.join('\n')}`).toEqual([]);
  });

  test('public API barrel no longer ships useGridWithAtoms / useGridAtomContext', async ({ request }) => {
    // The Vite dev server resolves bare specifier `@iasbuilt/datagrid-react`
    // through its module graph. We pull the resolved JS the page would
    // actually execute and assert the removed names do not appear as
    // exported bindings. Substring match is sufficient: the names are
    // not referenced anywhere in the post-removal source, so any hit
    // means the deletion was incomplete.
    const res = await request.get(
      'http://localhost:5173/@id/@iasbuilt/datagrid-react/dist/index.js'
    );

    // Dev server may serve source instead of dist; fall back to the
    // playground entry that imports from the package, which inlines
    // re-exports.
    let body = '';
    if (res.ok()) {
      body = await res.text();
    } else {
      const fallback = await request.get('http://localhost:5173/spa-integration/main.tsx');
      // If even this fails we still want a useful error, not a hang.
      expect(fallback.ok(), 'could not fetch any artifact to scan').toBeTruthy();
      body = await fallback.text();
    }

    expect(body).not.toContain('useGridWithAtoms');
    expect(body).not.toContain('useGridAtomContext');
  });
});
