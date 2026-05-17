import { render, screen, fireEvent, within } from '@testing-library/react';
import { DataGrid } from '../DataGrid';
import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

type TestRow = { id: string; name: string; age: number };

function makeData(): TestRow[] {
  return [
    { id: '1', name: 'Alice', age: 30 },
    { id: '2', name: 'Bob', age: 25 },
    { id: '3', name: 'Charlie', age: 35 },
  ];
}

const columns = [
  { id: 'name', field: 'name', title: 'Name' },
  { id: 'age', field: 'age', title: 'Age', cellType: 'numeric' as const },
];

function renderGrid(overrides: Partial<Parameters<typeof DataGrid>[0]> = {}) {
  return render(
    <DataGrid data={makeData()} columns={columns} rowKey="id" {...(overrides as any)} />
  );
}

// ---------------------------------------------------------------------------
// Controls Column
// ---------------------------------------------------------------------------

describe('Controls Column', () => {
  it('does not render controls column when chrome.controls is not configured', () => {
    renderGrid();
    expect(screen.queryByTestId('chrome-controls-header')).toBeNull();
  });

  it('renders controls header cell when enabled', () => {
    renderGrid({
      chrome: {
        controls: {
          actions: [{ key: 'view', label: 'View' }],
        },
      },
    });
    expect(screen.getByTestId('chrome-controls-header')).toBeInTheDocument();
  });

  it('renders a controls cell in each data row', () => {
    renderGrid({
      chrome: {
        controls: {
          actions: [{ key: 'view', label: 'View' }],
        },
      },
    });
    const controlsCells = screen.getAllByTestId('chrome-controls-cell');
    expect(controlsCells).toHaveLength(makeData().length);
  });

  it('renders action buttons with custom render function', () => {
    renderGrid({
      chrome: {
        controls: {
          actions: [{ key: 'view', label: 'View', render: () => 'ICON' }],
        },
      },
    });
    const controlsCells = screen.getAllByTestId('chrome-controls-cell');
    const firstCellButtons = within(controlsCells[0]!).getAllByRole('button');
    expect(firstCellButtons[0]!.textContent).toBe('ICON');
  });

  it('action onClick fires with correct rowId and rowIndex', () => {
    const onClick = vi.fn();
    renderGrid({
      chrome: {
        controls: {
          actions: [{ key: 'view', label: 'View', onClick }],
        },
      },
    });
    const controlsCells = screen.getAllByTestId('chrome-controls-cell');
    const firstButton = within(controlsCells[0]!).getByRole('button');
    fireEvent.click(firstButton);
    expect(onClick).toHaveBeenCalledWith('1', 0);
  });

  it('controls header has correct width', () => {
    renderGrid({
      chrome: {
        controls: {
          width: 80,
          actions: [{ key: 'view', label: 'View' }],
        },
      },
    });
    const header = screen.getByTestId('chrome-controls-header');
    expect(header.style.width).toBe('80px');
  });
});

// ---------------------------------------------------------------------------
// Row Number Column
// ---------------------------------------------------------------------------

describe('Row Number Column', () => {
  it('does not render row numbers when not configured', () => {
    renderGrid();
    expect(screen.queryByTestId('chrome-row-number-header')).toBeNull();
  });

  it('renders # header when enabled', () => {
    renderGrid({ chrome: { rowNumbers: true } });
    const header = screen.getByTestId('chrome-row-number-header');
    expect(header).toBeInTheDocument();
    expect(header.textContent).toBe('#');
  });

  it('renders 1-based row numbers for each data row', () => {
    renderGrid({ chrome: { rowNumbers: true } });
    const rowNumberCells = screen.getAllByTestId('chrome-row-number');
    expect(rowNumberCells).toHaveLength(3);
    expect(rowNumberCells[0]!.textContent).toBe('1');
    expect(rowNumberCells[1]!.textContent).toBe('2');
    expect(rowNumberCells[2]!.textContent).toBe('3');
  });

  it('row-number cell sets a non-default cursor that communicates "select this row" (#74)', () => {
    renderGrid({ chrome: { rowNumbers: true } });
    const rowNumberCells = screen.getAllByTestId('chrome-row-number');
    const defaultCursors = new Set(['auto', 'text', 'default', '']);
    for (const cell of rowNumberCells) {
      const cursor = (cell as HTMLElement).style.cursor;
      expect(defaultCursors.has(cursor)).toBe(false);
      expect(cursor.length).toBeGreaterThan(0);
    }
  });

  it('click on row number selects entire row', () => {
    renderGrid({ chrome: { rowNumbers: true } });
    const rowNumberCells = screen.getAllByTestId('chrome-row-number');
    fireEvent.click(rowNumberCells[0]!);

    // With row-level outline: the row container gets the box-shadow and
    // per-cell outlines are suppressed.
    const row = document.querySelector('[data-row-id="1"][role="row"]') as HTMLElement;
    expect(row.style.boxShadow).toContain('--dg-selection-border');
    const cells = row.querySelectorAll('[role="gridcell"]');
    cells.forEach((cell) => {
      expect((cell as HTMLElement).style.outline).toBe('none');
    });
  });

  it('shift+click extends selection to clicked row', () => {
    renderGrid({ chrome: { rowNumbers: true }, selectionMode: 'row' });
    const rowNumberCells = screen.getAllByTestId('chrome-row-number');

    // Click row 1
    fireEvent.click(rowNumberCells[0]!);
    // Shift+click row 3
    fireEvent.click(rowNumberCells[2]!, { shiftKey: true });

    // All three rows should be selected — row-level box-shadow is present and
    // per-cell outlines are suppressed.
    ['1', '2', '3'].forEach((rowId) => {
      const row = document.querySelector(`[data-row-id="${rowId}"][role="row"]`) as HTMLElement;
      expect(row.style.boxShadow).toContain('--dg-selection-border');
      const cells = row.querySelectorAll('[role="gridcell"]');
      cells.forEach((cell) => {
        expect((cell as HTMLElement).style.outline).toBe('none');
      });
    });
  });

  it('ctrl+click toggles row selection', () => {
    renderGrid({ chrome: { rowNumbers: true } });
    const rowNumberCells = screen.getAllByTestId('chrome-row-number');

    // Click row 1
    fireEvent.click(rowNumberCells[0]!);
    // Ctrl+click (metaKey for macOS) row 3
    fireEvent.click(rowNumberCells[2]!, { metaKey: true });

    // Row 3 is the last-selected (primary) range: it gets the row-level
    // box-shadow and its cells are suppressed.
    const row3 = document.querySelector('[data-row-id="3"][role="row"]') as HTMLElement;
    expect(row3.style.boxShadow).toContain('--dg-selection-border');
    row3.querySelectorAll('[role="gridcell"]').forEach((cell) => {
      expect((cell as HTMLElement).style.outline).toBe('none');
    });

    // Row 1 is also selected (disjoint singleton) — row-level box-shadow is
    // present and per-cell outlines are suppressed.
    const row1 = document.querySelector('[data-row-id="1"][role="row"]') as HTMLElement;
    expect(row1.style.boxShadow).toContain('--dg-selection-border');
    row1.querySelectorAll('[role="gridcell"]').forEach((cell) => {
      expect((cell as HTMLElement).style.outline).toBe('none');
    });

    // Row 2 should NOT be selected — no box-shadow or cell outlines.
    const row2 = document.querySelector('[data-row-id="2"][role="row"]') as HTMLElement;
    expect(row2.style.boxShadow ?? '').not.toContain('--dg-selection-border');
    row2.querySelectorAll('[role="gridcell"]').forEach((cell) => {
      expect((cell as HTMLElement).style.outline).not.toContain('2px solid');
    });
  });

  it('row number cell has data-row-number attribute', () => {
    renderGrid({ chrome: { rowNumbers: true } });
    const rowNumberCells = screen.getAllByTestId('chrome-row-number');
    expect(rowNumberCells[0]!.getAttribute('data-row-number')).toBe('1');
  });

  it('row number cell is draggable when reorderable', () => {
    renderGrid({ chrome: { rowNumbers: { reorderable: true } } });
    const rowNumberCells = screen.getAllByTestId('chrome-row-number');
    expect(rowNumberCells[0]!).toHaveAttribute('draggable', 'true');
  });
});

// ---------------------------------------------------------------------------
// Both Columns Together
// ---------------------------------------------------------------------------

describe('Both Columns Together', () => {
  it('both render when both are configured', () => {
    renderGrid({
      chrome: {
        controls: {
          actions: [{ key: 'view', label: 'View' }],
        },
        rowNumbers: true,
      },
    });
    expect(screen.getByTestId('chrome-controls-header')).toBeInTheDocument();
    expect(screen.getByTestId('chrome-row-number-header')).toBeInTheDocument();
  });

  it('controls column is first in each row, row number is last', () => {
    renderGrid({
      chrome: {
        controls: {
          actions: [{ key: 'view', label: 'View' }],
        },
        rowNumbers: true,
      },
    });

    // Check DOM ordering within the first data row
    const row = document.querySelector('[data-row-id="1"][role="row"]') as HTMLElement;
    const children = Array.from(row.children);

    const controlsIndex = children.findIndex(
      (el) => (el as HTMLElement).dataset.testid === 'chrome-controls-cell' ||
              el.getAttribute('data-testid') === 'chrome-controls-cell',
    );
    const rowNumberIndex = children.findIndex(
      (el) => (el as HTMLElement).dataset.testid === 'chrome-row-number' ||
              el.getAttribute('data-testid') === 'chrome-row-number',
    );

    expect(controlsIndex).toBeLessThan(rowNumberIndex);
  });
});

// ---------------------------------------------------------------------------
// Row Drag Reorder
// ---------------------------------------------------------------------------

describe('Row Drag Reorder', () => {
  it('dragStart sets data transfer with rowId', () => {
    renderGrid({ chrome: { rowNumbers: { reorderable: true } } });
    const rowNumberCells = screen.getAllByTestId('chrome-row-number');

    const setData = vi.fn();
    fireEvent.dragStart(rowNumberCells[0]!, {
      dataTransfer: { setData },
    });

    expect(setData).toHaveBeenCalledWith('text/plain', '1');
  });

  it('drop on another row triggers reorder', () => {
    const onRowReorder = vi.fn();
    renderGrid({
      onRowReorder,
      chrome: { rowNumbers: { reorderable: true } },
    });
    const rowNumberCells = screen.getAllByTestId('chrome-row-number');

    // Drag row 1
    fireEvent.dragStart(rowNumberCells[0]!, {
      dataTransfer: {
        setData: vi.fn(),
        getData: () => '1',
      },
    });

    // Drop on row 3
    fireEvent.dragOver(rowNumberCells[2]!, {
      dataTransfer: { getData: () => '1' },
    });
    fireEvent.drop(rowNumberCells[2]!, {
      dataTransfer: { getData: () => '1' },
    });

    expect(onRowReorder).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceRowId: '1',
        targetRowId: '3',
      }),
    );
  });
});
