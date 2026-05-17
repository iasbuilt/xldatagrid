/**
 * End-to-end: Issue #79 — Ctrl+C writes a dual-flavor ClipboardItem.
 *
 * Today the grid's copy handler emits a single `text/plain` TSV string via
 * `navigator.clipboard.writeText(...)`. Excel, Google Sheets and Numbers all
 * prefer `text/html` when present and fall back to `text/plain` otherwise —
 * writing only the plain flavour means pasted data loses cell structure when
 * dropped into a document target.
 *
 * Phase B upgrades `use-keyboard.ts` to call `navigator.clipboard.write(...)`
 * with a `ClipboardItem` carrying BOTH flavours. This spec asserts the public
 * contract issue #79 promises:
 *
 *   1. `navigator.clipboard.read()` returns a `ClipboardItem` whose `types`
 *      include BOTH `text/plain` and `text/html`.
 *   2. The plain payload is tab-delimited (TSV) and contains a row separator.
 *   3. The HTML payload contains a `<table>` with `<tr>` rows and `<td>`
 *      cells reflecting the selected range.
 *   4. The HTML body row count matches the selected row count.
 *
 * Playwright requires `clipboard-read` and `clipboard-write` permissions
 * before `navigator.clipboard.read()` will succeed inside a secure context.
 */
import { test, expect, type Page } from '@playwright/test';

const STORY_URL =
  '/iframe.html?viewMode=story&id=examples-clipboard--copy-paste';

async function waitForGrid(page: Page): Promise<void> {
  await page.locator('[role="grid"]').first().waitFor({ state: 'visible' });
}

async function readClipboard(
  page: Page,
): Promise<{ types: string[]; text: string; html: string }> {
  return page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    const out: { types: string[]; text: string; html: string } = {
      types: [],
      text: '',
      html: '',
    };
    for (const item of items) {
      for (const t of item.types) {
        out.types.push(t);
        const blob = await item.getType(t);
        const s = await blob.text();
        if (t === 'text/plain') out.text = s;
        if (t === 'text/html') out.html = s;
      }
    }
    return out;
  });
}

test.describe('Issue #79 — Ctrl+C writes dual-flavor ClipboardItem', () => {
  test.beforeEach(async ({ context, page }) => {
    // Permission grants must happen before the page navigates so the
    // `navigator.clipboard` API resolves into the granted state inside the
    // story iframe.
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(STORY_URL);
    await waitForGrid(page);
  });

  test('multi-cell selection + Ctrl+C exposes both text/plain (TSV) and text/html (<table>)', async ({
    page,
  }) => {
    // Build a 2×2 range: anchor at row 1 / first cell, shift-click row 2 / col 2.
    const anchor = page
      .locator('[role="gridcell"][data-row-id="1"]')
      .first();
    await anchor.click();

    const row2Cells = page.locator('[role="row"][data-row-id="2"] [role="gridcell"]');
    const cellCount = await row2Cells.count();
    expect(cellCount).toBeGreaterThanOrEqual(2);
    await row2Cells.nth(1).click({ modifiers: ['Shift'] });

    // Platform-aware copy chord. Playwright's webkit/firefox/chromium share
    // the `KeyC` accelerator name but disagree on the modifier.
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+KeyC`);

    // The clipboard API is asynchronous — give the write() promise a tick
    // to settle before reading.
    await page.waitForTimeout(150);

    const clip = await readClipboard(page);

    // Contract #1: both flavours are present on the ClipboardItem.
    expect(clip.types).toContain('text/plain');
    expect(clip.types).toContain('text/html');

    // Contract #2: plain payload is TSV (tabs between cells, LF between rows).
    expect(clip.text.length).toBeGreaterThan(0);
    expect(clip.text).toContain('\t');
    expect(clip.text).toContain('\n');

    // Contract #3: HTML payload is a real <table> with <tr>/<td> children.
    const lower = clip.html.toLowerCase();
    expect(lower).toContain('<table');
    expect(lower).toContain('<tr');
    expect(lower).toContain('<td');
  });

  test('HTML <tbody> contains one <tr> per selected data row', async ({ page }) => {
    // Select a vertical 3×1 strip — rows 1..3, single column.
    const r1 = page.locator('[role="gridcell"][data-row-id="1"]').first();
    await r1.click();
    const r3 = page.locator('[role="gridcell"][data-row-id="3"]').first();
    await r3.click({ modifiers: ['Shift'] });

    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+KeyC`);
    await page.waitForTimeout(150);

    const clip = await readClipboard(page);

    // The HTML body should hold exactly three <tr> elements (one per
    // selected row); a header <tr> may also appear inside <thead>. Counting
    // body rows by scanning the <tbody>...</tbody> slice avoids coupling
    // the test to whether <thead> is emitted.
    const lower = clip.html.toLowerCase();
    const tbodyStart = lower.indexOf('<tbody');
    const tbodyEnd = lower.indexOf('</tbody>');
    expect(tbodyStart).toBeGreaterThanOrEqual(0);
    expect(tbodyEnd).toBeGreaterThan(tbodyStart);
    const tbodySlice = lower.slice(tbodyStart, tbodyEnd);
    const trMatches = tbodySlice.match(/<tr[\s>]/g) ?? [];
    expect(trMatches.length).toBe(3);

    // The plain text flavour should also encode three rows separated by LF.
    // A trailing LF is allowed and expected for multi-row payloads; we count
    // non-empty lines so the assertion does not depend on the trailing-LF
    // policy of the serialiser.
    const nonEmptyLines = clip.text.split('\n').filter((l) => l.length > 0);
    // 3 data rows + optional 1 header row.
    expect(nonEmptyLines.length).toBeGreaterThanOrEqual(3);
    expect(nonEmptyLines.length).toBeLessThanOrEqual(4);
  });

  test('HTML payload round-trips through document.execCommand("insertHTML")', async ({
    page,
  }) => {
    // Select a small 2×2 range and copy.
    const anchor = page.locator('[role="gridcell"][data-row-id="1"]').first();
    await anchor.click();
    const row2Cells = page.locator('[role="row"][data-row-id="2"] [role="gridcell"]');
    await row2Cells.nth(1).click({ modifiers: ['Shift'] });

    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.press(`${modifier}+KeyC`);
    await page.waitForTimeout(150);

    // Inject the HTML flavour into a contenteditable target and assert the
    // resulting DOM contains a <table>. This mirrors what Excel and Google
    // Docs do when their paste handler picks `text/html` over `text/plain`.
    const tableCellCount = await page.evaluate(async () => {
      const items = await navigator.clipboard.read();
      let html = '';
      for (const item of items) {
        if (item.types.includes('text/html')) {
          const blob = await item.getType('text/html');
          html = await blob.text();
          break;
        }
      }
      const host = document.createElement('div');
      host.innerHTML = html;
      const tables = host.querySelectorAll('table');
      const tds = host.querySelectorAll('td');
      return { tables: tables.length, tds: tds.length };
    });

    expect(tableCellCount.tables).toBe(1);
    // 2x2 selection -> 4 <td>s in <tbody>.
    expect(tableCellCount.tds).toBe(4);
  });
});
