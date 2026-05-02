import { render, screen, fireEvent, act } from '@testing-library/react';
import { DataGrid } from '../DataGrid';
import {
  serializeRangeToText,
  parseTextToGrid,
  CellRange,
  ColumnDef,
  GridModel,
  createGridModel,
} from '@iasbuilt/datagrid-core';
import { vi } from 'vitest';

type TestRow = { id: string; name: string; age: number; city: string; readonly?: boolean };

function makeData(): TestRow[] {
  return [
    { id: '1', name: 'Alice', age: 30, city: 'London' },
    { id: '2', name: 'Bob', age: 25, city: 'Paris' },
    { id: '3', name: 'Charlie', age: 35, city: 'Berlin' },
  ];
}

const columns: ColumnDef<TestRow>[] = [
  { id: 'name', field: 'name', title: 'Name' },
  { id: 'age', field: 'age', title: 'Age' },
  { id: 'city', field: 'city', title: 'City' },
];

const readOnlyColumns: ColumnDef<TestRow>[] = [
  { id: 'name', field: 'name', title: 'Name', editable: false },
  { id: 'age', field: 'age', title: 'Age' },
  { id: 'city', field: 'city', title: 'City' },
];

// ---------------------------------------------------------------------------
// Clipboard stub factory — created fresh per test to avoid mutable module-scope
// state leaking across parallel test runs.
// ---------------------------------------------------------------------------

interface ClipboardStub {
  text: string;
  html: string;
  reset: () => void;
  mock: {
    writeText: ReturnType<typeof vi.fn>;
    readText: ReturnType<typeof vi.fn>;
    write: ReturnType<typeof vi.fn>;
    read: ReturnType<typeof vi.fn>;
  };
}

function createClipboardStub(): ClipboardStub {
  const stub: ClipboardStub = {
    text: '',
    html: '',
    reset() { stub.text = ''; stub.html = ''; },
    mock: {} as ClipboardStub['mock'],
  };

  stub.mock = {
    writeText: vi.fn(async (text: string) => { stub.text = text; }),
    readText: vi.fn(async () => stub.text),
    write: vi.fn(async (items: ClipboardItem[]) => {
      for (const item of items) {
        if (item.types.includes('text/plain')) {
          stub.text = await (await item.getType('text/plain')).text();
        }
        if (item.types.includes('text/html')) {
          stub.html = await (await item.getType('text/html')).text();
        }
      }
    }),
    read: vi.fn(async () => {
      const items: ClipboardItem[] = [];
      const blobs: Record<string, Blob> = {};
      if (stub.text) blobs['text/plain'] = new Blob([stub.text], { type: 'text/plain' });
      if (stub.html) blobs['text/html'] = new Blob([stub.html], { type: 'text/html' });
      if (Object.keys(blobs).length > 0) items.push(new ClipboardItem(blobs));
      return items;
    }),
  };

  Object.defineProperty(navigator, 'clipboard', {
    value: stub.mock,
    writable: true,
    configurable: true,
  });

  return stub;
}

function mockClipboard(): ClipboardStub {
  return createClipboardStub();
}

function createTestModel(data?: TestRow[], cols?: ColumnDef<TestRow>[]) {
  return createGridModel<TestRow>({
    data: data ?? makeData(),
    columns: (cols ?? columns) as ColumnDef<TestRow>[],
    rowKey: 'id',
  });
}

describe('Clipboard integration — copy', () => {
  beforeEach(() => { mockClipboard(); });

  it('copy single cell to clipboard on Ctrl+C', () => {
    const model = createTestModel();
    model.select({ rowId: '1', field: 'name' });
    const range = model.getState().selection.range!;
    const text = serializeRangeToText(
      model.getState().data as Record<string, unknown>[],
      range,
      model.getVisibleColumns() as ColumnDef[],
      model.getRowIds(),
    );
    expect(text).toBe('Alice');
  });

  it('copy cell value as plain text', () => {
    const model = createTestModel();
    model.select({ rowId: '2', field: 'age' });
    const range = model.getState().selection.range!;
    const text = serializeRangeToText(
      model.getState().data as Record<string, unknown>[],
      range,
      model.getVisibleColumns() as ColumnDef[],
      model.getRowIds(),
    );
    expect(text).toBe('25');
  });

  it('copy cell with formatting metadata', () => {
    const model = createTestModel();
    model.select({ rowId: '1', field: 'name' });
    const range = model.getState().selection.range!;
    const text = serializeRangeToText(
      model.getState().data as Record<string, unknown>[],
      range,
      model.getVisibleColumns() as ColumnDef[],
      model.getRowIds(),
    );
    expect(typeof text).toBe('string');
    expect(text.length).toBeGreaterThan(0);
  });

  it('copy selected range to clipboard', () => {
    const model = createTestModel();
    model.select({ rowId: '1', field: 'name' });
    model.extendTo({ rowId: '2', field: 'age' });
    const range = model.getState().selection.range!;
    // Pass explicit `false` so the body-row count assertion below is
    // unaffected by the Feature 6 header-by-default rule for multi-row
    // ranges.
    const text = serializeRangeToText(
      model.getState().data as Record<string, unknown>[],
      range,
      model.getVisibleColumns() as ColumnDef[],
      model.getRowIds(),
      false,
    );
    // Trailing LF (issue #65) introduces an empty terminal segment when
    // split — drop it before counting body rows.
    const lines = text.split('\n').filter(l => l.length > 0);
    expect(lines).toHaveLength(2);
    expect(lines[0]!.split('\t')).toHaveLength(2);
  });

  it('copy range as tab-separated rows and newline-separated columns', () => {
    const model = createTestModel();
    model.select({ rowId: '1', field: 'name' });
    model.extendTo({ rowId: '3', field: 'age' });
    const range = model.getState().selection.range!;
    // Pass explicit `false` to isolate the body rows from the Feature 6
    // header-by-default rule for multi-row ranges.
    const text = serializeRangeToText(
      model.getState().data as Record<string, unknown>[],
      range,
      model.getVisibleColumns() as ColumnDef[],
      model.getRowIds(),
      false,
    );
    expect(text).toBe('Alice\t30\nBob\t25\nCharlie\t35\n');
  });

  it('copy includes header row when configured', () => {
    const model = createTestModel();
    model.select({ rowId: '1', field: 'name' });
    model.extendTo({ rowId: '1', field: 'age' });
    const range = model.getState().selection.range!;
    const text = serializeRangeToText(
      model.getState().data as Record<string, unknown>[],
      range,
      model.getVisibleColumns() as ColumnDef[],
      model.getRowIds(),
      true,
    );
    const lines = text.split('\n');
    expect(lines[0]).toBe('Name\tAge');
    expect(lines[1]).toBe('Alice\t30');
  });

  it('copy excludes header row when not configured', () => {
    const model = createTestModel();
    model.select({ rowId: '1', field: 'name' });
    model.extendTo({ rowId: '1', field: 'age' });
    const range = model.getState().selection.range!;
    const text = serializeRangeToText(
      model.getState().data as Record<string, unknown>[],
      range,
      model.getVisibleColumns() as ColumnDef[],
      model.getRowIds(),
      false,
    );
    // Trailing LF (issue #65) introduces an empty terminal segment when
    // split — drop it before counting body rows.
    const lines = text.split('\n').filter(l => l.length > 0);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('Alice\t30');
  });

  it('copy fires onCopy callback with copied data', async () => {
    const model = createTestModel();
    const copyEvents: Record<string, unknown>[] = [];

    // Register a listener that captures clipboard:copy events
    await model.registerExtension({
      id: 'copy-listener',
      name: 'Copy Listener',
      hooks: () => [{
        event: 'clipboard:copy',
        handler: (evt) => { copyEvents.push(evt.payload); },
      }],
    });

    model.select({ rowId: '1', field: 'name' });
    const event = await model.dispatch('clipboard:copy', { text: 'Alice' });

    // The dispatched event must carry the text payload — not a trivial pass
    expect(event.type).toBe('clipboard:copy');
    expect(event.payload.text).toBe('Alice');
    // And the hook listener must have been invoked with the same payload
    expect(copyEvents).toHaveLength(1);
    expect(copyEvents[0]!.text).toBe('Alice');
  });
});

describe('Clipboard integration — cut', () => {
  beforeEach(() => { mockClipboard(); });

  it('cut single cell on Ctrl+X', async () => {
    const model = createTestModel();
    model.select({ rowId: '1', field: 'name' });
    const range = model.getState().selection.range!;
    const text = serializeRangeToText(
      model.getState().data as Record<string, unknown>[],
      range,
      model.getVisibleColumns() as ColumnDef[],
      model.getRowIds(),
    );
    await model.setCellValue({ rowId: '1', field: 'name' }, null);
    expect(text).toBe('Alice');
    expect(model.getState().data[0]!.name).toBeNull();
  });

  it('cut clears source cell value', async () => {
    const model = createTestModel();
    model.select({ rowId: '2', field: 'city' });
    await model.setCellValue({ rowId: '2', field: 'city' }, null);
    expect(model.getState().data[1]!.city).toBeNull();
  });

  it('cut single cell places value on clipboard', async () => {
    const stub = mockClipboard();
    const model = createTestModel();
    model.select({ rowId: '1', field: 'name' });
    const range = model.getState().selection.range!;
    const text = serializeRangeToText(
      model.getState().data as Record<string, unknown>[],
      range,
      model.getVisibleColumns() as ColumnDef[],
      model.getRowIds(),
    );
    await navigator.clipboard.writeText(text);
    expect(stub.mock.writeText).toHaveBeenCalledWith('Alice');
  });

  it('cut selected range clears source cells', async () => {
    const model = createTestModel();
    model.select({ rowId: '1', field: 'name' });
    model.extendTo({ rowId: '2', field: 'name' });
    await model.setCellValue({ rowId: '1', field: 'name' }, null);
    await model.setCellValue({ rowId: '2', field: 'name' }, null);
    expect(model.getState().data[0]!.name).toBeNull();
    expect(model.getState().data[1]!.name).toBeNull();
  });

  it('cut fires onCut callback with cut data', async () => {
    const model = createTestModel();
    model.select({ rowId: '1', field: 'name' });
    const event = await model.dispatch('clipboard:copy', { operation: 'cut', text: 'Alice' });
    expect(event.type).toBe('clipboard:copy');
  });

  it('cut respects read-only cells by skipping them', () => {
    const model = createTestModel(undefined, readOnlyColumns);
    const original = model.getState().data[0]!.name;
    const nameCol = model.getVisibleColumns().find(c => c.field === 'name');
    expect(nameCol!.editable).toBe(false);
    const ageCol = model.getVisibleColumns().find(c => c.field === 'age');
    expect(ageCol!.editable).not.toBe(false);
  });
});

describe('Clipboard integration — paste', () => {
  beforeEach(() => { mockClipboard(); });

  it('paste single cell from clipboard on Ctrl+V', () => {
    const model = createTestModel();
    const parsed = parseTextToGrid('NewValue');
    expect(parsed).toEqual([['NewValue']]);
  });

  it('paste single cell into focused cell', async () => {
    const model = createTestModel();
    model.select({ rowId: '2', field: 'name' });
    const parsed = parseTextToGrid('Zara');
    await model.setCellValue({ rowId: '2', field: 'name' }, parsed[0]![0]);
    expect(model.getState().data[1]!.name).toBe('Zara');
  });

  it('paste range into grid starting at focused cell', async () => {
    const model = createTestModel();
    model.select({ rowId: '1', field: 'name' });
    const parsed = parseTextToGrid('X\t10\nY\t20');
    const cols = model.getVisibleColumns();
    const rowIds = model.getRowIds();
    const startRowIdx = rowIds.indexOf('1');
    const startColIdx = cols.findIndex(c => c.field === 'name');

    for (let r = 0; r < parsed.length; r++) {
      for (let c = 0; c < parsed[r]!.length; c++) {
        const rIdx = startRowIdx + r;
        const cIdx = startColIdx + c;
        if (rIdx < rowIds.length && cIdx < cols.length) {
          await model.setCellValue({ rowId: rowIds[rIdx]!, field: cols[cIdx]!.field }, parsed[r]![c]);
        }
      }
    }
    expect(model.getState().data[0]!.name).toBe('X');
    expect(model.getState().data[0]!.age).toBe(10);
    expect(model.getState().data[1]!.name).toBe('Y');
    expect(model.getState().data[1]!.age).toBe(20);
  });

  it('paste range expands to fill target area', () => {
    const parsed = parseTextToGrid('A\nB');
    expect(parsed).toHaveLength(2);
    const expanded = Array.from({ length: 4 }, (_, i) => parsed[i % parsed.length]);
    expect(expanded).toHaveLength(4);
    expect(expanded[2]).toEqual(parsed[0]);
    expect(expanded[3]).toEqual(parsed[1]);
  });

  it('paste range truncates when exceeding grid bounds', async () => {
    const model = createTestModel();
    model.select({ rowId: '3', field: 'city' });
    const parsed = parseTextToGrid('Munich\nVienna\nPrague');
    const rowIds = model.getRowIds();
    const startRow = rowIds.indexOf('3');
    let pasted = 0;
    for (let r = 0; r < parsed.length; r++) {
      if (startRow + r < rowIds.length) {
        await model.setCellValue({ rowId: rowIds[startRow + r]!, field: 'city' }, parsed[r]![0]);
        pasted++;
      }
    }
    expect(pasted).toBe(1);
    expect(model.getState().data[2]!.city).toBe('Munich');
  });

  it('paste creates new rows when pasting beyond last row', async () => {
    const model = createTestModel();
    model.select({ rowId: '3', field: 'name' });
    const parsed = parseTextToGrid('Diana\nEve');
    const rowIds = model.getRowIds();
    const startRow = rowIds.indexOf('3');

    for (let r = 0; r < parsed.length; r++) {
      const rIdx = startRow + r;
      if (rIdx >= model.getState().data.length) {
        await model.insertRow(model.getState().data.length, { id: `new-${r}`, name: '', age: 0, city: '' });
      }
      const currentRowIds = model.getRowIds();
      await model.setCellValue({ rowId: currentRowIds[rIdx]!, field: 'name' }, parsed[r]![0]);
    }
    expect(model.getState().data).toHaveLength(4);
    expect(model.getState().data[2]!.name).toBe('Diana');
    expect(model.getState().data[3]!.name).toBe('Eve');
  });

  it('paste respects column types and parses values', () => {
    const parsed = parseTextToGrid('42\ttrue\tHello');
    expect(parsed[0]![0]).toBe(42);
    expect(parsed[0]![1]).toBe(true);
    expect(parsed[0]![2]).toBe('Hello');
  });

  it('paste skips read-only cells', async () => {
    const model = createTestModel(undefined, readOnlyColumns);
    const nameCol = model.getVisibleColumns().find(c => c.field === 'name');
    expect(nameCol!.editable).toBe(false);
    const parsed = parseTextToGrid('NewName\t99');
    const cols = model.getVisibleColumns();
    for (let c = 0; c < parsed[0]!.length; c++) {
      const col = cols[c];
      if (col && col.editable !== false) {
        await model.setCellValue({ rowId: '1', field: col.field }, parsed[0]![c]);
      }
    }
    expect(model.getState().data[0]!.name).toBe('Alice');
    expect(model.getState().data[0]!.age).toBe(99);
  });

  it('paste fires onPaste callback with pasted data', async () => {
    const model = createTestModel();
    const event = await model.dispatch('clipboard:paste', { text: 'Hello' });
    expect(event.type).toBe('clipboard:paste');
    expect(event.payload.text).toBe('Hello');
  });

  it('paste fires onChange for each modified cell', async () => {
    const model = createTestModel();
    const listener = vi.fn();
    model.subscribe(listener);

    const parsed = parseTextToGrid('X\nY');
    await model.setCellValue({ rowId: '1', field: 'name' }, parsed[0]![0]);
    await model.setCellValue({ rowId: '2', field: 'name' }, parsed[1]![0]);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('paste triggers validation on pasted values', () => {
    const validateCols: ColumnDef<TestRow>[] = [
      {
        id: 'age', field: 'age', title: 'Age',
        validate: (v) => {
          if (typeof v === 'number' && v < 0) return { message: 'Negative', severity: 'error' };
          return null;
        },
      },
      { id: 'name', field: 'name', title: 'Name' },
    ];
    const model = createTestModel(undefined, validateCols);
    const col = model.getVisibleColumns().find(c => c.field === 'age')!;
    const result = col.validate!(-5);
    expect(result).toEqual({ message: 'Negative', severity: 'error' });
    expect(col.validate!(10)).toBeNull();
  });

  it('paste supports undo of entire paste operation', async () => {
    const model = createTestModel();
    const original1 = model.getState().data[0]!.name;
    const original2 = model.getState().data[1]!.name;

    await model.setCellValue({ rowId: '1', field: 'name' }, 'X');
    await model.setCellValue({ rowId: '2', field: 'name' }, 'Y');

    model.undo();
    expect(model.getState().data[1]!.name).toBe(original2);
    model.undo();
    expect(model.getState().data[0]!.name).toBe(original1);
  });

  it('paste handles HTML formatted clipboard data', () => {
    const htmlContent = '<table><tr><td>A</td><td>1</td></tr></table>';
    const plainFromHtml = 'A\t1';
    const parsed = parseTextToGrid(plainFromHtml);
    expect(parsed).toEqual([['A', 1]]);
  });

  it('paste handles tab-separated plain text clipboard data', () => {
    const text = 'Hello\tWorld\n42\ttrue';
    const parsed = parseTextToGrid(text);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual(['Hello', 'World']);
    expect(parsed[1]).toEqual([42, true]);
  });
});

// ---------------------------------------------------------------------------
// Phase A — RED tests for Feature 6: Ctrl/Cmd+C upgrade to dual-flavor
// `navigator.clipboard.write()` with a `ClipboardItem` carrying both
// `text/plain` (TSV) and `text/html` (<table>) blobs.
//
// The current implementation calls `navigator.clipboard.writeText(text)` with
// TSV only, so every test in this block is expected to fail today — either
// because `write` is never invoked, or because the Blob it receives lacks one
// of the two required flavors.
//
// jsdom does not implement `ClipboardItem`, so we install a minimal polyfill
// inside the describe's `beforeEach` before wiring up the clipboard stub.
// ---------------------------------------------------------------------------

interface ClipboardItemLike {
  readonly types: ReadonlyArray<string>;
  getType(type: string): Promise<Blob>;
}

// Minimal jsdom-compatible polyfill. Spec parity only as far as the grid
// needs: a constructor taking `{ [mime]: Blob }`, a `types` array, and
// `getType(mime): Promise<Blob>`.
class ClipboardItemPolyfill implements ClipboardItemLike {
  readonly types: ReadonlyArray<string>;
  private readonly _blobs: Record<string, Blob>;
  constructor(blobs: Record<string, Blob>) {
    this._blobs = blobs;
    this.types = Object.keys(blobs);
  }
  async getType(type: string): Promise<Blob> {
    const b = this._blobs[type];
    if (!b) throw new Error(`type ${type} not present on ClipboardItem`);
    return b;
  }
}

function installClipboardItemPolyfill(): void {
  if (typeof (globalThis as { ClipboardItem?: unknown }).ClipboardItem === 'undefined') {
    (globalThis as unknown as { ClipboardItem: typeof ClipboardItemPolyfill }).ClipboardItem =
      ClipboardItemPolyfill;
  }
}

function fireCopy(target: HTMLElement, opts: { meta?: boolean; ctrl?: boolean } = { ctrl: true }): void {
  fireEvent.keyDown(target, {
    key: 'c',
    code: 'KeyC',
    ctrlKey: !!opts.ctrl,
    metaKey: !!opts.meta,
    bubbles: true,
  });
}

function renderGridWithSelection(selection: { anchor: { rowId: string; field: keyof TestRow & string }; focus: { rowId: string; field: keyof TestRow & string } }) {
  const result = render(
    <DataGrid
      data={makeData()}
      columns={columns as ColumnDef[]}
      rowKey="id"
      selectionMode="range"
      keyboardNavigation
    />,
  );
  const grid = result.container.querySelector('[role="grid"]') as HTMLElement | null;
  if (!grid) throw new Error('grid not rendered');
  // The grid is the element that owns the keydown listener. Focus it so
  // synthetic key events land on the correct target.
  grid.focus();
  // Trigger the selection by clicking the anchor cell, then shift-clicking
  // the focus cell. Using the React testing-library API keeps this aligned
  // with how a real user would drive the grid.
  const cellAt = (rowId: string, field: string) =>
    result.container.querySelector(
      `[role="gridcell"][data-row-id="${rowId}"][data-field="${field}"]`,
    ) as HTMLElement;
  fireEvent.click(cellAt(selection.anchor.rowId, selection.anchor.field));
  if (
    selection.anchor.rowId !== selection.focus.rowId ||
    selection.anchor.field !== selection.focus.field
  ) {
    fireEvent.click(cellAt(selection.focus.rowId, selection.focus.field), {
      shiftKey: true,
    });
  }
  return { ...result, grid, cellAt };
}

describe('Clipboard integration — dual-flavor copy via navigator.clipboard.write (Feature 6)', () => {
  let stub: ClipboardStub;

  beforeEach(() => {
    installClipboardItemPolyfill();
    stub = mockClipboard();
  });

  it('Ctrl+C on a range calls navigator.clipboard.write exactly once with both text/plain and text/html flavors', async () => {
    const { grid } = renderGridWithSelection({
      anchor: { rowId: '1', field: 'name' },
      focus: { rowId: '2', field: 'age' },
    });
    fireCopy(grid, { ctrl: true });
    // Allow any microtasks queued by the write to flush.
    await Promise.resolve();
    await Promise.resolve();

    expect(stub.mock.write).toHaveBeenCalledTimes(1);
    const items: ClipboardItem[] = stub.mock.write.mock.calls[0]![0];
    expect(items).toHaveLength(1);
    const types = Array.from(items[0]!.types);
    expect(types).toContain('text/plain');
    expect(types).toContain('text/html');
  });

  it('Cmd+C (macOS) produces the same dual-flavor ClipboardItem', async () => {
    const { grid } = renderGridWithSelection({
      anchor: { rowId: '1', field: 'name' },
      focus: { rowId: '2', field: 'age' },
    });
    fireCopy(grid, { meta: true });
    await Promise.resolve();
    await Promise.resolve();
    expect(stub.mock.write).toHaveBeenCalledTimes(1);
    const items: ClipboardItem[] = stub.mock.write.mock.calls[0]![0];
    const types = Array.from(items[0]!.types);
    expect(types).toEqual(expect.arrayContaining(['text/plain', 'text/html']));
  });

  it('the text/plain Blob contains TSV with a header row for a range selection', async () => {
    const { grid } = renderGridWithSelection({
      anchor: { rowId: '1', field: 'name' },
      focus: { rowId: '2', field: 'age' },
    });
    fireCopy(grid, { ctrl: true });
    await Promise.resolve();
    await Promise.resolve();

    // The clipboard stub copies the text blob into `stub.text` as a side
    // effect of `write`. Assert against that canonical string.
    expect(stub.text.split('\n')[0]).toBe('Name\tAge');
    expect(stub.text.split('\n')[1]).toBe('Alice\t30');
    expect(stub.text.split('\n')[2]).toBe('Bob\t25');
  });

  it('the text/html Blob contains a <table> wrapping the same data', async () => {
    const { grid } = renderGridWithSelection({
      anchor: { rowId: '1', field: 'name' },
      focus: { rowId: '2', field: 'age' },
    });
    fireCopy(grid, { ctrl: true });
    // The stub's `write` implementation decodes both blobs via chained
    // `await item.getType(...).text()` calls. Each decode costs 2 microtasks
    // (one per `await`), so populating both `text/plain` AND `text/html`
    // requires ~4 microtask ticks before assertions can observe the HTML
    // flavour. Flushing 6 ticks is conservative and resilient to any future
    // polyfill changes.
    for (let i = 0; i < 6; i++) await Promise.resolve();

    expect(stub.html).toContain('<table');
    expect(stub.html).toContain('</table>');
    expect(stub.html).toContain('Alice');
    expect(stub.html).toContain('Bob');
    // Header row must be present.
    expect(stub.html).toContain('Name');
    expect(stub.html).toContain('Age');
  });

  it('single-cell selection copies just the cell with NO header row', async () => {
    const { grid } = renderGridWithSelection({
      anchor: { rowId: '1', field: 'name' },
      focus: { rowId: '1', field: 'name' },
    });
    fireCopy(grid, { ctrl: true });
    // See the microtask-budget note on the "<table>" test above: 2 awaits
    // only flush the text/plain branch; the text/html assertion needs more.
    for (let i = 0; i < 6; i++) await Promise.resolve();

    expect(stub.mock.write).toHaveBeenCalledTimes(1);
    // No header: the entire TSV is just the one value.
    expect(stub.text).toBe('Alice');
    // And the HTML flavor is a single-cell table (no <th>).
    expect(stub.html).toContain('<td');
    expect(stub.html).not.toContain('<th');
  });

  it('excludes chrome columns from both flavors even when chrome is enabled', async () => {
    // Render the grid with chrome columns on; the row-number gutter is
    // enabled via `chrome: { rowNumbers: true }`. A range spanning from the
    // gutter (conceptually) to the last data column MUST still produce TSV
    // and HTML that contain only the data columns.
    const { container } = render(
      <DataGrid
        data={makeData()}
        columns={columns as ColumnDef[]}
        rowKey="id"
        selectionMode="range"
        keyboardNavigation
        chrome={{ rowNumbers: true }}
      />,
    );
    const grid = container.querySelector('[role="grid"]') as HTMLElement;
    grid.focus();
    const first = container.querySelector(
      '[role="gridcell"][data-row-id="1"][data-field="name"]',
    ) as HTMLElement;
    const last = container.querySelector(
      '[role="gridcell"][data-row-id="2"][data-field="city"]',
    ) as HTMLElement;
    fireEvent.click(first);
    fireEvent.click(last, { shiftKey: true });
    fireCopy(grid, { ctrl: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(stub.mock.write).toHaveBeenCalled();
    // Row number "1" / "2" are the chrome gutter digits — they must not
    // appear as their own TSV column. Lines must contain exactly three
    // tab-separated cells: name, age, city.
    const lines = stub.text.split('\n').filter((l) => l.length > 0);
    for (const line of lines) {
      const cells = line.split('\t');
      // Headers OR data — either way the width must be 3.
      expect(cells).toHaveLength(3);
    }
    // HTML flavor: must not carry a leading row-number column.
    expect(stub.html).not.toMatch(/<td[^>]*>\s*1\s*<\/td>\s*<td[^>]*>\s*Alice/);
  });
});
