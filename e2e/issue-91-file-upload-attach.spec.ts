/**
 * End-to-end: file-upload cell's `onAttach` contract (issue #91).
 *
 * Drives the playground demo at `/file-upload-attach/`. The demo wires a
 * mock backend whose mode + latency are controlled from the page. We:
 *
 *   1. Drop a file into an `upload` cell and assert the mock backend was
 *      invoked (the cell forwarded the file through `onAttach`).
 *   2. Confirm the in-flight UI is visible while the mock is pending.
 *   3. Confirm the success UI is shown after the mock resolves and the
 *      committed cell value renders the uploaded filename.
 *   4. Switch the mock to `fail` mode, drop another file, and assert the
 *      error UI surfaces with a retry button — then flip back to success
 *      mode and click Retry to prove the cell can recover with the same
 *      file (no re-pick needed).
 *
 * The playground is served by the Vite webServer entry in
 * `playwright.config.ts` on port 5173, so we point `baseURL` at it for
 * this spec.
 */
import { test, expect, type Page, type Locator } from '@playwright/test';

test.use({ baseURL: 'http://localhost:5173' });

const PAGE = '/file-upload-attach/';

/** The Attachment column cell for a specific row id. */
function attachmentCell(page: Page, rowId: string): Locator {
  return page
    .locator(`[role="gridcell"][data-row-id="${rowId}"][data-field="attachment"]`)
    .first();
}

/**
 * Synthesise a DataTransfer + File entirely inside the page and dispatch
 * real `dragover` / `drop` React-synthetic events at the cell's drop-zone
 * div. The drop zone listens via React's synthetic event system, so the
 * dispatched events must be `DragEvent` instances with a populated
 * `dataTransfer.files` list — Playwright's `dispatchEvent` plumbing does
 * not always wire the `dataTransfer` JSHandle through to React's handler,
 * so we do the dispatch ourselves inside `evaluate`.
 */
async function dropFile(
  cell: Locator,
  name: string,
  contents: string,
  mime: string,
) {
  await cell.evaluate(
    (el, { name, contents, mime }) => {
      // The drop zone is the first descendant div with data-upload-state.
      const target = el.querySelector('[data-upload-state]') as HTMLElement | null;
      if (!target) throw new Error('drop zone not found inside cell');
      const dt = new DataTransfer();
      dt.items.add(new File([contents], name, { type: mime }));
      target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
      target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    },
    { name, contents, mime },
  );
}

test.describe('issue #91 — upload cell onAttach contract', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PAGE);
    await page.locator('[role="grid"]').first().waitFor({ state: 'visible' });
    await page.locator('[data-testid="event-log"]').waitFor({ state: 'visible' });
  });

  test('drops a file, sees in-flight UI, then success after the mock resolves', async ({ page }) => {
    // Make latency long enough for the in-flight assertion to be reliable.
    await page.locator('[data-testid="mode-select"]').selectOption('success');
    await page.locator('[data-testid="latency-input"]').fill('600');

    const cell = attachmentCell(page, 'r1');

    // Either path is valid for the cell — we exercise the hidden input
    // (deterministic) AND the drag-drop branch (covered in the next test).
    await cell.locator('input[type="file"]').setInputFiles({
      name: 'report.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 fake'),
    });

    // In-flight UI must be visible while the mock is pending.
    await expect(cell.locator('[data-testid="upload-cell-uploading"]')).toBeVisible();
    // The upload button is disabled while pending.
    await expect(cell.locator('button', { hasText: /Upload|Replace/ })).toBeDisabled();

    // The mock backend logs `onAttach({ file: report.pdf, ... })` and
    // then resolves with an AttachmentRef — the cell flips to success.
    await expect(cell.locator('[data-testid="upload-cell-success"]')).toBeVisible({ timeout: 5_000 });

    // The committed cell value renders as a download link with the
    // uploaded filename.
    await expect(cell.locator('a[role="link"]', { hasText: 'report.pdf' })).toBeVisible();

    // The event log proves onAttach actually fired with the file.
    const log = page.locator('[data-testid="event-log"]');
    await expect(log).toContainText('onAttach({ file: report.pdf');
    await expect(log).toContainText('resolve(');
  });

  test('drag-drop path also invokes onAttach with the dropped file', async ({ page }) => {
    await page.locator('[data-testid="mode-select"]').selectOption('success');
    await page.locator('[data-testid="latency-input"]').fill('100');

    const cell = attachmentCell(page, 'r2');
    await dropFile(cell, 'dropped.txt', 'hello drop', 'text/plain');

    await expect(cell.locator('[data-testid="upload-cell-success"]')).toBeVisible({ timeout: 5_000 });
    await expect(cell.locator('a[role="link"]', { hasText: 'dropped.txt' })).toBeVisible();
    await expect(page.locator('[data-testid="event-log"]')).toContainText('onAttach({ file: dropped.txt');
  });

  test('failure shows the error message + retry button; retry re-runs onAttach with the same file and recovers', async ({ page }) => {
    await page.locator('[data-testid="mode-select"]').selectOption('fail');
    await page.locator('[data-testid="latency-input"]').fill('100');

    const cell = attachmentCell(page, 'r3');
    await cell.locator('input[type="file"]').setInputFiles({
      name: 'will-fail.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"ok":false}'),
    });

    // Error state visible with the mock-supplied message; Retry exposed.
    await expect(cell.locator('[data-testid="upload-cell-error"]')).toBeVisible({ timeout: 5_000 });
    await expect(cell.locator('[data-testid="upload-cell-error"]')).toContainText('Mock backend rejected upload');
    const retry = cell.locator('button', { hasText: 'Retry' });
    await expect(retry).toBeVisible();
    // Prior cell value untouched — no link rendered (cell was empty before).
    await expect(cell.locator('a[role="link"]')).toHaveCount(0);

    // Flip the mock to success and click Retry — the cell must re-issue
    // onAttach with the SAME file and end up in the success state without
    // a re-pick.
    await page.locator('[data-testid="mode-select"]').selectOption('success');
    await retry.click();

    await expect(cell.locator('[data-testid="upload-cell-success"]')).toBeVisible({ timeout: 5_000 });
    await expect(cell.locator('a[role="link"]', { hasText: 'will-fail.json' })).toBeVisible();

    // onAttach was invoked twice — once for the initial failure, once for
    // the retry. The log captures both.
    const log = page.locator('[data-testid="event-log"]');
    const entries = await log.locator('div').allInnerTexts();
    const onAttachLines = entries.filter((t) => t.includes('onAttach({ file: will-fail.json'));
    expect(onAttachLines.length).toBeGreaterThanOrEqual(2);
  });
});
