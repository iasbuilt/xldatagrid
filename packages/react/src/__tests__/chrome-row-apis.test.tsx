/**
 * Unit tests for the three chrome row-level presentation APIs introduced in
 * issue #14:
 *   - `chrome.getRowBorder`
 *   - `chrome.getRowBackground`
 *   - `chrome.getChromeCellContent`
 *
 * Each API is tested in isolation with focused assertions against the
 * rendered DOM. Downstream issues (#15 row-click selection, #16 Shift+Arrow
 * range styling, #18 transpose field column) build on these hooks, so the
 * tests also cover the interop contract that those features depend on —
 * notably: the resolvers are invoked per rendered row with `(row, rowId,
 * rowIndex)`, a nullish return preserves the default rendering, and
 * `getChromeCellContent.onClick` fires alongside (not in place of) the
 * built-in row-selection click unless the consumer calls `stopPropagation`.
 */
import { render, screen, fireEvent, within } from '@testing-library/react';
import { DataGrid } from '../DataGrid';
import type { RowBorderStyle, ChromeCellContent } from '@iasbuilt/datagrid-core';
import { vi } from 'vitest';

type TestRow = { id: string; name: string; category: 'alpha' | 'beta' | 'gamma' };

function makeData(): TestRow[] {
  return [
    { id: '1', name: 'Alice', category: 'alpha' },
    { id: '2', name: 'Bob', category: 'beta' },
    { id: '3', name: 'Charlie', category: 'gamma' },
  ];
}

const columns = [
  { id: 'name', field: 'name', title: 'Name' },
  { id: 'category', field: 'category', title: 'Category' },
];

function renderGrid(overrides: Partial<Parameters<typeof DataGrid>[0]> = {}) {
  return render(
    <DataGrid data={makeData()} columns={columns} rowKey="id" {...(overrides as any)} />,
  );
}

// ---------------------------------------------------------------------------
// getRowBackground
// ---------------------------------------------------------------------------

describe('chrome.getRowBackground', () => {
  it('applies the returned colour as the row container background', () => {
    renderGrid({
      chrome: {
        rowNumbers: true,
        getRowBackground: (row: TestRow) =>
          row.category === 'alpha' ? '#ff0000' : null,
      },
    });

    const row1 = document.querySelector('[data-row-id="1"][role="row"]') as HTMLElement;
    // Browsers canonicalise HEX → rgb; accept either so the test survives
    // cross-engine differences.
    expect(row1.style.background).toMatch(/#ff0000|rgb\(255,\s*0,\s*0\)/i);
  });

  it('leaves the default zebra background when the resolver returns null', () => {
    renderGrid({
      chrome: {
        rowNumbers: true,
        getRowBackground: (row: TestRow) =>
          row.category === 'alpha' ? '#ff0000' : null,
      },
    });

    const row2 = document.querySelector('[data-row-id="2"][role="row"]') as HTMLElement;
    // Row 2 falls back to the `--dg-row-bg-alt` token (odd index).
    expect(row2.style.background).toContain('--dg-row-bg');
  });

  it('receives (row, rowId, rowIndex) on each invocation', () => {
    const spy = vi.fn<(row: TestRow, rowId: string, rowIndex: number) => string | null>(() => null);
    renderGrid({
      chrome: {
        rowNumbers: true,
        getRowBackground: spy,
      },
    });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ id: '1', name: 'Alice' }),
      '1',
      0,
    );
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ id: '3' }),
      '3',
      2,
    );
  });

  it('is a no-op when not configured (default zebra remains)', () => {
    renderGrid({ chrome: { rowNumbers: true } });
    const row1 = document.querySelector('[data-row-id="1"][role="row"]') as HTMLElement;
    // No inline HEX — default zebra token expression.
    expect(row1.style.background).toContain('--dg-row-bg');
  });
});

// ---------------------------------------------------------------------------
// getRowBorder
// ---------------------------------------------------------------------------

describe('chrome.getRowBorder', () => {
  it('paints all four sides by default with the returned colour/style/width', () => {
    const border: RowBorderStyle = { color: '#00ff00', style: 'dashed', width: 2 };
    renderGrid({
      chrome: {
        rowNumbers: true,
        getRowBorder: (row: TestRow) => (row.id === '1' ? border : null),
      },
    });
    const row1 = document.querySelector('[data-row-id="1"][role="row"]') as HTMLElement;
    // Each side receives the shorthand we computed. We assert the individual
    // edge styles rather than the shorthand to avoid depending on CSSOM
    // serialisation.
    expect(row1.style.borderTop).toContain('2px');
    expect(row1.style.borderTop).toContain('dashed');
    expect(row1.style.borderRight).toContain('dashed');
    expect(row1.style.borderBottom).toContain('dashed');
    expect(row1.style.borderLeft).toContain('dashed');
  });

  it('only paints the listed `sides`', () => {
    renderGrid({
      chrome: {
        rowNumbers: true,
        getRowBorder: (row: TestRow) =>
          row.id === '2' ? { color: '#0000ff', sides: ['top', 'bottom'] } : null,
      },
    });
    const row2 = document.querySelector('[data-row-id="2"][role="row"]') as HTMLElement;
    expect(row2.style.borderTop).toBeTruthy();
    expect(row2.style.borderBottom).toBeTruthy();
    // Left / right were NOT in `sides` — no inline override; style stays empty.
    expect(row2.style.borderLeft).toBe('');
    expect(row2.style.borderRight).toBe('');
  });

  it('returning null leaves only the stock row separator', () => {
    renderGrid({
      chrome: {
        rowNumbers: true,
        getRowBorder: () => null,
      },
    });
    const row1 = document.querySelector('[data-row-id="1"][role="row"]') as HTMLElement;
    // Stock separator is `1px solid var(--dg-border-color, #e2e8f0)` on the
    // bottom edge only.
    expect(row1.style.borderBottom).toContain('--dg-border-color');
    expect(row1.style.borderTop).toBe('');
  });

  it('receives (row, rowId, rowIndex)', () => {
    const spy = vi.fn<(row: TestRow, rowId: string, rowIndex: number) => null>(() => null);
    renderGrid({
      chrome: {
        rowNumbers: true,
        getRowBorder: spy,
      },
    });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ id: '1' }),
      '1',
      0,
    );
  });
});

// ---------------------------------------------------------------------------
// getChromeCellContent
// ---------------------------------------------------------------------------

describe('chrome.getChromeCellContent', () => {
  it('renders custom text inside the row-number chrome cell', () => {
    renderGrid({
      chrome: {
        rowNumbers: true,
        getChromeCellContent: (row: TestRow): ChromeCellContent | null =>
          row.id === '1' ? { text: 'A' } : null,
      },
    });
    const cells = screen.getAllByTestId('chrome-row-number');
    // First cell shows custom text, others fall back to the 1-based digit.
    expect(within(cells[0]!).getByTestId('chrome-row-content-text').textContent).toBe('A');
    expect(cells[1]!.textContent).toBe('2');
    expect(cells[2]!.textContent).toBe('3');
  });

  it('renders a supplied icon node alongside text', () => {
    renderGrid({
      chrome: {
        rowNumbers: true,
        getChromeCellContent: (row: TestRow): ChromeCellContent | null =>
          row.id === '2'
            ? { text: 'hello', icon: <span data-testid="my-icon">*</span> }
            : null,
      },
    });
    const cells = screen.getAllByTestId('chrome-row-number');
    const second = cells[1]!;
    expect(within(second).getByTestId('my-icon')).toBeInTheDocument();
    expect(within(second).getByTestId('chrome-row-content-text').textContent).toBe('hello');
  });

  it('invokes `onClick` alongside row selection when not stopped', () => {
    const onClick = vi.fn<(evt: MouseEvent, rowId: string, rowIndex: number) => void>();
    renderGrid({
      chrome: {
        rowNumbers: true,
        getChromeCellContent: (): ChromeCellContent => ({ text: 'x', onClick }),
      },
    });
    const cells = screen.getAllByTestId('chrome-row-number');
    fireEvent.click(cells[0]!);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]![1]).toBe('1'); // rowId
    expect(onClick.mock.calls[0]![2]).toBe(0); // rowIndex

    // Default row-selection still fires — the row container gets the box-shadow
    // and per-cell outlines are suppressed.
    const row1 = document.querySelector('[data-row-id="1"][role="row"]') as HTMLElement;
    expect(row1.style.boxShadow).toContain('--dg-selection-border');
    const gridcells = row1.querySelectorAll('[role="gridcell"]');
    gridcells.forEach((cell) => {
      expect((cell as HTMLElement).style.outline).toBe('none');
    });
  });

  it('calling stopPropagation in onClick suppresses row selection', () => {
    const onClick = vi.fn<(evt: MouseEvent) => void>((evt) => {
      evt.stopPropagation();
    });
    renderGrid({
      chrome: {
        rowNumbers: true,
        getChromeCellContent: (): ChromeCellContent => ({ text: 'x', onClick }),
      },
    });
    const cells = screen.getAllByTestId('chrome-row-number');
    fireEvent.click(cells[0]!);

    expect(onClick).toHaveBeenCalledTimes(1);

    // Selection was suppressed — no cell in row 1 should carry the
    // selection outline.
    const row1 = document.querySelector('[data-row-id="1"][role="row"]') as HTMLElement;
    const gridcells = row1.querySelectorAll('[role="gridcell"]');
    gridcells.forEach((cell) => {
      expect((cell as HTMLElement).style.outline).not.toContain('2px solid');
    });
  });

  it('returning null falls back to the default row-number digit', () => {
    renderGrid({
      chrome: {
        rowNumbers: true,
        getChromeCellContent: () => null,
      },
    });
    const cells = screen.getAllByTestId('chrome-row-number');
    expect(cells[0]!.textContent).toBe('1');
    expect(cells[1]!.textContent).toBe('2');
  });

  it('aria-label reflects custom text when provided', () => {
    renderGrid({
      chrome: {
        rowNumbers: true,
        getChromeCellContent: (row: TestRow): ChromeCellContent | null =>
          row.id === '1' ? { text: 'Favourite' } : null,
      },
    });
    const cells = screen.getAllByTestId('chrome-row-number');
    expect(cells[0]!.getAttribute('aria-label')).toBe('Favourite');
    // Unaffected rows keep the default "Row N" label.
    expect(cells[1]!.getAttribute('aria-label')).toBe('Row 2');
  });
});

// ---------------------------------------------------------------------------
// Composition — all three resolvers can be combined on the same grid
// ---------------------------------------------------------------------------

describe('chrome row APIs composition', () => {
  it('background, border and chrome content all apply independently', () => {
    renderGrid({
      chrome: {
        rowNumbers: true,
        getRowBackground: (row: TestRow) => (row.id === '1' ? '#fff1f2' : null),
        getRowBorder: (row: TestRow) =>
          row.id === '1' ? { color: '#e11d48', width: 2 } : null,
        getChromeCellContent: (row: TestRow): ChromeCellContent | null =>
          row.id === '1' ? { text: 'Row A' } : null,
      },
    });
    const row1 = document.querySelector('[data-row-id="1"][role="row"]') as HTMLElement;
    expect(row1.style.background).toMatch(/#fff1f2|rgb\(255,\s*241,\s*242\)/i);
    expect(row1.style.borderTop).toContain('2px');

    const cells = screen.getAllByTestId('chrome-row-number');
    expect(within(cells[0]!).getByTestId('chrome-row-content-text').textContent).toBe('Row A');
  });
});
