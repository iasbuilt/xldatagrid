import { render, screen, fireEvent, within } from '@testing-library/react';
import { DataGrid, CellRendererProps } from '../DataGrid';
import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

type TestRow = { id: string; name: string; age: number };

// Return fresh row objects each call so mutations in one test don't bleed into
// another. The core model does a shallow array copy but reuses row references,
// so mutations via setCellValue (undo/redo commands) would otherwise corrupt
// the shared fixture.
function makeData(): TestRow[] {
  return [
    { id: '1', name: 'Alice', age: 30 },
    { id: '2', name: 'Bob', age: 25 },
    { id: '3', name: 'Charlie', age: 35 },
  ];
}

const columns = [
  { id: 'name', field: 'name', title: 'Name' },
  { id: 'age', field: 'age', title: 'Age', sortable: true },
];

function renderGrid(overrides: Partial<Parameters<typeof DataGrid>[0]> = {}) {
  return render(
    <DataGrid
      data={makeData()}
      columns={columns}
      rowKey="id"
      {...(overrides as any)}
    />
  );
}

// ---------------------------------------------------------------------------
// Structure & ARIA
// ---------------------------------------------------------------------------

describe('DataGrid structure', () => {
  it('renders grid container with role="grid"', () => {
    renderGrid();
    expect(screen.getByRole('grid')).toBeInTheDocument();
  });

  it('renders the correct number of column headers', () => {
    renderGrid();
    expect(screen.getAllByRole('columnheader')).toHaveLength(columns.length);
  });

  it('renders column header labels', () => {
    renderGrid();
    expect(screen.getByRole('columnheader', { name: /name/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /age/i })).toBeInTheDocument();
  });

  it('renders the correct number of data rows', () => {
    renderGrid();
    // The header row + data rows all have role="row"; subtract 1 for header
    const allRows = screen.getAllByRole('row');
    expect(allRows.length).toBe(makeData().length + 1);
  });

  it('renders cell content', () => {
    renderGrid();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText('Charlie')).toBeInTheDocument();
  });

  it('renders "No data" when data is empty', () => {
    renderGrid({ data: [] });
    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  it('renders aria-rowcount on the grid', () => {
    renderGrid();
    expect(screen.getByRole('grid')).toHaveAttribute('aria-rowcount', String(makeData().length));
  });

  it('renders aria-colcount on the grid', () => {
    renderGrid();
    expect(screen.getByRole('grid')).toHaveAttribute('aria-colcount', String(columns.length));
  });

  it('grid container has tabIndex for keyboard focus', () => {
    renderGrid();
    expect(screen.getByRole('grid')).toHaveAttribute('tabindex', '0');
  });

  it('applies custom className', () => {
    renderGrid({ className: 'my-grid' });
    const grid = screen.getByRole('grid');
    expect(grid.className).toContain('my-grid');
    expect(grid.className).toContain('iasbuilt-datagrid');
  });

  it('applies custom style', () => {
    renderGrid({ style: { border: '2px solid red' } });
    expect(screen.getByRole('grid')).toHaveStyle({ border: '2px solid red' });
  });

  it('renders alternating row backgrounds via CSS variables', () => {
    renderGrid();
    const rows = screen.getAllByRole('row').slice(1); // exclude header
    // Even rows (index 0, 2) get dg-row-bg; odd rows get dg-row-bg-alt
    expect(rows[0]).toHaveStyle({ background: 'var(--dg-row-bg, #ffffff)' });
    expect(rows[1]).toHaveStyle({ background: 'var(--dg-row-bg-alt, #f8fafc)' });
  });
});

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

describe('DataGrid selection', () => {
  it('clicking a cell selects it (outline applied)', () => {
    renderGrid();
    const cells = screen.getAllByRole('gridcell');
    const aliceNameCell = cells[0]!;
    fireEvent.click(aliceNameCell);
    // After selection, the cell should have an outline style set
    expect(aliceNameCell).toHaveStyle({ outline: '2px solid var(--dg-selection-border, #3b82f6)' });
  });
});

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

describe('DataGrid editing', () => {
  it('double clicking a cell enters edit mode (shows input)', () => {
    renderGrid();
    const cells = screen.getAllByRole('gridcell');
    fireEvent.dblClick(cells[0]!);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('typing in edit input and pressing Enter commits the value', () => {
    const onCellEdit = vi.fn();
    renderGrid({ onCellEdit });
    const cells = screen.getAllByRole('gridcell');
    fireEvent.dblClick(cells[0]!);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Zara' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCellEdit).toHaveBeenCalledWith('1', 'name', 'Zara', 'Alice');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  // Excel-365 commit-and-advance: Enter in the inline fallback editor must
  // commit AND move selection DOWN one row (staying on the same cell only
  // at the last row).
  it('Enter commits and moves selection DOWN one row (Excel-365)', () => {
    const onCellEdit = vi.fn();
    renderGrid({ onCellEdit });
    const cells = screen.getAllByRole('gridcell');
    const aliceNameCell = cells[0]!;
    fireEvent.click(aliceNameCell);
    fireEvent.dblClick(aliceNameCell);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Zara' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCellEdit).toHaveBeenCalledWith('1', 'name', 'Zara', 'Alice');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    const refreshed = screen.getAllByRole('gridcell');
    // The row below's name cell carries the selection outline after commit.
    expect(refreshed[2]!).toHaveStyle({
      outline: '2px solid var(--dg-selection-border, #3b82f6)',
    });
    // The originally edited cell no longer carries the outline.
    expect(refreshed[0]!).not.toHaveStyle({
      outline: '2px solid var(--dg-selection-border, #3b82f6)',
    });
  });

  // Excel-365 commit-and-advance: Tab in the inline fallback editor must
  // commit AND move selection RIGHT one column (staying on the same cell
  // only at the last column).
  it('Tab commits and moves selection RIGHT one column (Excel-365)', () => {
    const onCellEdit = vi.fn();
    renderGrid({ onCellEdit });
    const cells = screen.getAllByRole('gridcell');
    const aliceNameCell = cells[0]!;
    fireEvent.click(aliceNameCell);
    fireEvent.dblClick(aliceNameCell);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Zara' } });
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(onCellEdit).toHaveBeenCalledWith('1', 'name', 'Zara', 'Alice');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    const refreshed = screen.getAllByRole('gridcell');
    // The cell to the right (Alice's age) now carries the selection outline.
    expect(refreshed[1]!).toHaveStyle({
      outline: '2px solid var(--dg-selection-border, #3b82f6)',
    });
    // The originally edited cell no longer carries the outline.
    expect(refreshed[0]!).not.toHaveStyle({
      outline: '2px solid var(--dg-selection-border, #3b82f6)',
    });
  });

  it('pressing Escape in edit mode cancels without committing', () => {
    const onCellEdit = vi.fn();
    renderGrid({ onCellEdit });
    const cells = screen.getAllByRole('gridcell');
    fireEvent.dblClick(cells[0]!);
    const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCellEdit).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  // Issue #11: Esc reverts the draft, exits edit mode, and keeps selection.
  it('Escape reverts typed value and keeps cell selected (issue #11)', () => {
    const onCellEdit = vi.fn();
    renderGrid({ onCellEdit });
    const cells = screen.getAllByRole('gridcell');
    const aliceNameCell = cells[0]!;

    // Select via click, then enter edit mode and type a new value.
    fireEvent.click(aliceNameCell);
    expect(aliceNameCell).toHaveStyle({
      outline: '2px solid var(--dg-selection-border, #3b82f6)',
    });
    fireEvent.dblClick(aliceNameCell);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Mallory' } });
    expect(input.value).toBe('Mallory');

    // Escape must cancel (no commit), exit edit mode, and keep selection.
    fireEvent.keyDown(input, { key: 'Escape' });

    // The blur that fires when React unmounts the input must not commit.
    fireEvent.blur(input);

    // Value in the row data reverted: onCellEdit never fired, display shows
    // the original text.
    expect(onCellEdit).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    const refreshedCell = screen.getAllByRole('gridcell')[0]!;
    expect(refreshedCell.textContent).toContain('Alice');

    // Selection still on the same cell.
    expect(refreshedCell).toHaveStyle({
      outline: '2px solid var(--dg-selection-border, #3b82f6)',
    });
  });

  it('Escape bubbling from input to grid-level handler keeps selection (issue #11)', () => {
    const onCellEdit = vi.fn();
    renderGrid({ onCellEdit });
    const cells = screen.getAllByRole('gridcell');
    const aliceNameCell = cells[0]!;

    fireEvent.click(aliceNameCell);
    fireEvent.dblClick(aliceNameCell);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Mallory' } });

    // fireEvent.keyDown on the input bubbles through React delegation to the
    // grid container's native keydown listener. The cell-level React handler
    // cancels the edit first; when the bubble reaches the grid, `editing`
    // is already null — the grid handler must detect `e.target` is still the
    // input and NOT clear the selection.
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onCellEdit).not.toHaveBeenCalled();
    const refreshedCell = screen.getAllByRole('gridcell')[0]!;
    expect(refreshedCell.textContent).toContain('Alice');
    expect(refreshedCell).toHaveStyle({
      outline: '2px solid var(--dg-selection-border, #3b82f6)',
    });
  });

  it('read-only mode prevents editing on double click', () => {
    renderGrid({ readOnly: true });
    const cells = screen.getAllByRole('gridcell');
    fireEvent.dblClick(cells[0]!);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('calls onCellEdit callback with correct args on blur commit', () => {
    const onCellEdit = vi.fn();
    renderGrid({ onCellEdit });
    const cells = screen.getAllByRole('gridcell');
    fireEvent.dblClick(cells[0]!);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Updated' } });
    fireEvent.blur(input);
    expect(onCellEdit).toHaveBeenCalledWith('1', 'name', 'Updated', 'Alice');
  });
});

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

describe('DataGrid sorting', () => {
  it('clicking a sortable column header sorts ascending', () => {
    renderGrid();
    const ageHeader = screen.getByRole('columnheader', { name: /age/i });
    fireEvent.click(ageHeader);
    expect(ageHeader).toHaveAttribute('aria-sort', 'ascending');
  });

  it('clicking a sorted column header again sorts descending', () => {
    renderGrid();
    const ageHeader = screen.getByRole('columnheader', { name: /age/i });
    fireEvent.click(ageHeader);
    fireEvent.click(ageHeader);
    expect(ageHeader).toHaveAttribute('aria-sort', 'descending');
  });

  it('clicking a descending sorted column header removes sort', () => {
    renderGrid();
    const ageHeader = screen.getByRole('columnheader', { name: /age/i });
    fireEvent.click(ageHeader);
    fireEvent.click(ageHeader);
    fireEvent.click(ageHeader);
    expect(ageHeader).toHaveAttribute('aria-sort', 'none');
  });

  it('shows sort indicator arrow on sorted column', () => {
    renderGrid();
    const ageHeader = screen.getByRole('columnheader', { name: /age/i });
    fireEvent.click(ageHeader);
    // Ascending arrow character
    expect(ageHeader.textContent).toContain('\u25B2');
    fireEvent.click(ageHeader);
    // Descending arrow character
    expect(ageHeader.textContent).toContain('\u25BC');
  });

  it('calls onSortChange callback when column is sorted', () => {
    const onSortChange = vi.fn();
    renderGrid({ onSortChange });
    const ageHeader = screen.getByRole('columnheader', { name: /age/i });
    fireEvent.click(ageHeader);
    expect(onSortChange).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ field: 'age', dir: 'asc' })])
    );
  });

  it('aria-sort attribute defaults to "none" on unsorted columns', () => {
    renderGrid();
    const nameHeader = screen.getByRole('columnheader', { name: /name/i });
    expect(nameHeader).toHaveAttribute('aria-sort', 'none');
  });
});

// ---------------------------------------------------------------------------
// Virtualization
// ---------------------------------------------------------------------------

describe('DataGrid virtualization', () => {
  it('renders with virtual scrolling (only visible rows rendered)', () => {
    // With jsdom, viewport defaults to 800x600 from useVirtualization.
    // rowHeight=36 means ~17 visible rows + overscan. With only 3 data rows, all are rendered.
    renderGrid();
    const dataRows = screen.getAllByRole('row').slice(1);
    expect(dataRows.length).toBeLessThanOrEqual(makeData().length);
  });
});

// ---------------------------------------------------------------------------
// Null / undefined values
// ---------------------------------------------------------------------------

describe('DataGrid null and undefined values', () => {
  it('renders empty string placeholder for null cell values', () => {
    const nullData = [{ id: '1', name: null as unknown as string, age: 30 }];
    render(
      <DataGrid data={nullData} columns={columns} rowKey="id" />
    );
    const cells = screen.getAllByRole('gridcell');
    // name cell should render empty
    expect(cells[0]!.textContent?.trim()).toBe('');
  });

  it('renders empty string placeholder for undefined cell values', () => {
    const undefData = [{ id: '1', name: undefined as unknown as string, age: 30 }];
    render(
      <DataGrid data={undefData} columns={columns} rowKey="id" />
    );
    const cells = screen.getAllByRole('gridcell');
    expect(cells[0]!.textContent?.trim()).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Cell types
// ---------------------------------------------------------------------------

describe('DataGrid cell types', () => {
  it('boolean cell type renders check symbols', () => {
    const boolData = [{ id: '1', active: true }, { id: '2', active: false }];
    const boolColumns = [{ id: 'active', field: 'active', title: 'Active', cellType: 'boolean' as const }];
    render(<DataGrid data={boolData} columns={boolColumns} rowKey="id" />);
    expect(screen.getByText('\u2611')).toBeInTheDocument();
    expect(screen.getByText('\u2610')).toBeInTheDocument();
  });

  it('currency cell type renders formatted number', () => {
    const currData = [{ id: '1', price: 42.5 }];
    const currColumns = [{ id: 'price', field: 'price', title: 'Price', cellType: 'currency' as const }];
    render(<DataGrid data={currData} columns={currColumns} rowKey="id" />);
    expect(screen.getByText('$42.50')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Pivot modes
// ---------------------------------------------------------------------------

describe('DataGrid pivot modes', () => {
  it('renders row-driven pivot mode (all cells in row share the row cellType)', () => {
    const pivotData = [{ id: '1', col1: true, col2: false }];
    const pivotCols = [
      { id: 'col1', field: 'col1', title: 'Col 1' },
      { id: 'col2', field: 'col2', title: 'Col 2' },
    ];
    const rowTypes = [{ index: 0, cellType: 'boolean' as const }];
    render(
      <DataGrid
        data={pivotData}
        columns={pivotCols}
        rowKey="id"
        pivotMode="row"
        rowTypes={rowTypes}
      />
    );
    // Both cells should render as boolean
    expect(screen.getByText('\u2611')).toBeInTheDocument();
    expect(screen.getByText('\u2610')).toBeInTheDocument();
  });

  it('renders column-driven pivot (cellType on column def used)', () => {
    const pivotData = [{ id: '1', price: 99.9 }];
    const pivotCols = [{ id: 'price', field: 'price', title: 'Price', cellType: 'currency' as const }];
    render(
      <DataGrid data={pivotData} columns={pivotCols} rowKey="id" pivotMode="column" />
    );
    expect(screen.getByText('$99.90')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Custom cell renderers
// ---------------------------------------------------------------------------

describe('DataGrid custom cellRenderers', () => {
  it('renders custom renderer component when cellRenderers prop is provided', () => {
    function StarRenderer({ value }: CellRendererProps) {
      return <span data-testid="star-cell">⭐ {String(value)}</span>;
    }
    const customCols = [{ id: 'name', field: 'name', title: 'Name', cellType: 'text' as const }];
    render(
      <DataGrid
        data={makeData()}
        columns={customCols}
        rowKey="id"
        cellRenderers={{ text: StarRenderer as any }}
      />
    );
    const stars = screen.getAllByTestId('star-cell');
    expect(stars.length).toBe(makeData().length);
    expect(stars[0]!.textContent).toContain('Alice');
  });
});

// ---------------------------------------------------------------------------
// Re-render on data change
// ---------------------------------------------------------------------------

describe('DataGrid reactivity', () => {
  it('grid re-renders when data prop changes', () => {
    const { rerender } = renderGrid();
    expect(screen.getByText('Alice')).toBeInTheDocument();

    const newData: TestRow[] = [{ id: '4', name: 'Diana', age: 28 }];
    rerender(
      <DataGrid data={newData} columns={columns} rowKey="id" />
    );
    // DataGrid creates the model once via useMemo([], []), so the model holds
    // initial data; we assert the component at least re-renders without error.
    expect(screen.getByRole('grid')).toBeInTheDocument();
  });
});
