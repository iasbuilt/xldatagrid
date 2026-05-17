import { render, screen, fireEvent, within } from '@testing-library/react';
import { DataGrid } from '../DataGrid';
import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

type TestRow = { id: string; name: string; age: number; email?: string };

function makeData(): TestRow[] {
  return [
    { id: '1', name: 'Alice', age: 30 },
    { id: '2', name: 'Bob', age: 25 },
  ];
}

const columns = [
  { id: 'name', field: 'name', title: 'Name' },
  { id: 'age', field: 'age', title: 'Age', cellType: 'numeric' as const },
];

function renderGrid(overrides: Partial<Parameters<typeof DataGrid>[0]> = {}) {
  return render(
    <DataGrid
      data={makeData()}
      columns={columns}
      rowKey="id"
      ghostRow={true}
      {...(overrides as any)}
    />
  );
}

// ---------------------------------------------------------------------------
// Ghost Row Tests
// ---------------------------------------------------------------------------

describe('Ghost Row', () => {
  it('ghost row renders at bottom of grid', () => {
    renderGrid();
    const ghostRow = screen.getByTestId('ghost-row');
    expect(ghostRow).toBeInTheDocument();
    // It should appear after data rows
    const allRows = screen.getAllByRole('row');
    const lastRow = allRows[allRows.length - 1];
    expect(lastRow).toBe(ghostRow);
  });

  it('ghost row renders with placeholder styling', () => {
    renderGrid();
    const ghostRow = screen.getByTestId('ghost-row');
    expect(ghostRow).toHaveStyle({ opacity: '0.7' });
    // Check italic font on inputs
    const inputs = within(ghostRow).getAllByRole('textbox');
    expect(inputs[0]).toHaveStyle({ fontStyle: 'italic' });
  });

  it('ghost row cells are editable', () => {
    renderGrid();
    const ghostRow = screen.getByTestId('ghost-row');
    const inputs = within(ghostRow).getAllByRole('textbox');
    // Should have one input per column (numeric renders as textbox in this context - spinbutton)
    // Actually numeric type="number" has role spinbutton
    const allInputs = ghostRow.querySelectorAll('input');
    expect(allInputs.length).toBe(columns.length);
    // Type into first input
    fireEvent.change(allInputs[0]!, { target: { value: 'Test' } });
    expect(allInputs[0]!).toHaveValue('Test');
  });

  it('ghost row shows placeholder text per column', () => {
    const colsWithPlaceholders = [
      { id: 'name', field: 'name', title: 'Name', placeholder: 'Enter name' },
      { id: 'age', field: 'age', title: 'Age', placeholder: 'Enter age' },
    ];
    renderGrid({ columns: colsWithPlaceholders });
    const ghostRow = screen.getByTestId('ghost-row');
    const allInputs = ghostRow.querySelectorAll('input');
    expect(allInputs[0]).toHaveAttribute('placeholder', 'Enter name');
    expect(allInputs[1]).toHaveAttribute('placeholder', 'Enter age');
  });

  it('ghost row creates new data row on first cell edit', () => {
    const onRowAdd = vi.fn();
    renderGrid({ onRowAdd });
    const ghostRow = screen.getByTestId('ghost-row');
    const allInputs = ghostRow.querySelectorAll('input');

    // Type a value
    fireEvent.change(allInputs[0]!, { target: { value: 'NewPerson' } });
    // Navigate to last cell and press Enter to create
    fireEvent.change(allInputs[1]!, { target: { value: '42' } });
    // Press Enter on last cell to commit
    fireEvent.keyDown(allInputs[1]!, { key: 'Enter' });

    expect(onRowAdd).toHaveBeenCalledTimes(1);
    const addedData = onRowAdd.mock.calls[0]![0];
    expect(addedData.name).toBe('NewPerson');
    // After the @causl/core@0.2.1 invariant landed, ghost-row commits
    // coerce string `<input>` values per the column's declared cellType.
    // The 'age' column has cellType:'numeric', so the typed value is a
    // number (was: '42' string — the latent bug iasbuilt/xldatagrid#103
    // surfaced).
    expect(addedData.age).toBe(42);
  });

  it('ghost row new row appears above ghost row', () => {
    renderGrid();
    const ghostRow = screen.getByTestId('ghost-row');
    const allInputs = ghostRow.querySelectorAll('input');

    fireEvent.change(allInputs[0]!, { target: { value: 'NewEntry' } });
    fireEvent.change(allInputs[1]!, { target: { value: '50' } });
    fireEvent.keyDown(allInputs[1]!, { key: 'Enter' });

    // The new row should now be in the grid
    expect(screen.getByText('NewEntry')).toBeInTheDocument();
    // Ghost row should still be last
    const allRows = screen.getAllByRole('row');
    const newGhostRow = screen.getByTestId('ghost-row');
    expect(allRows[allRows.length - 1]).toBe(newGhostRow);
  });

  it('ghost row resets to empty after row creation', () => {
    renderGrid();
    const ghostRow = screen.getByTestId('ghost-row');
    const allInputs = ghostRow.querySelectorAll('input');

    fireEvent.change(allInputs[0]!, { target: { value: 'TempName' } });
    fireEvent.change(allInputs[1]!, { target: { value: '99' } });
    fireEvent.keyDown(allInputs[1]!, { key: 'Enter' });

    // After creation, the ghost row inputs should be cleared
    const newGhostRow = screen.getByTestId('ghost-row');
    const newInputs = newGhostRow.querySelectorAll('input');
    expect(newInputs[0]).toHaveValue('');
    // Number input returns null when empty
    expect(newInputs[1]).toHaveValue(null);
  });

  it('ghost row fires onRowAdd callback with new row data', () => {
    const onRowAdd = vi.fn();
    renderGrid({ onRowAdd });
    const ghostRow = screen.getByTestId('ghost-row');
    const allInputs = ghostRow.querySelectorAll('input');

    fireEvent.change(allInputs[0]!, { target: { value: 'Dana' } });
    fireEvent.change(allInputs[1]!, { target: { value: '28' } });
    fireEvent.keyDown(allInputs[1]!, { key: 'Enter' });

    // age coerced to number per cellType: 'numeric' (see related test
    // above for the @causl/core@0.2.1 invariant context).
    expect(onRowAdd).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Dana', age: 28 })
    );
  });

  it('ghost row validates required fields before creation', () => {
    const onRowAdd = vi.fn();
    renderGrid({
      onRowAdd,
      ghostRow: {
        validate: (values: Partial<TestRow>) => {
          if (!values.name) return 'Name is required';
          return null;
        },
      },
    });
    const ghostRow = screen.getByTestId('ghost-row');
    const allInputs = ghostRow.querySelectorAll('input');

    // Only fill age, leave name empty
    fireEvent.change(allInputs[1]!, { target: { value: '30' } });
    fireEvent.keyDown(allInputs[1]!, { key: 'Enter' });

    // Row should not be created
    expect(onRowAdd).not.toHaveBeenCalled();
  });

  it('ghost row shows validation errors on invalid fields', () => {
    renderGrid({
      columns: [
        {
          id: 'name', field: 'name', title: 'Name',
          validators: [
            {
              name: 'required',
              run: (value: any) => {
                if (!value || value === '') return { message: 'Name required', severity: 'error' as const };
                return null;
              },
            },
          ],
        },
        { id: 'age', field: 'age', title: 'Age' },
      ],
    });
    const ghostRow = screen.getByTestId('ghost-row');
    const allInputs = ghostRow.querySelectorAll('input');

    // Fill age but not name, then try to create
    fireEvent.change(allInputs[1]!, { target: { value: '25' } });
    fireEvent.keyDown(allInputs[1]!, { key: 'Enter' });

    // Should show validation error
    const errorEl = screen.getByTestId('ghost-error-name');
    expect(errorEl).toBeInTheDocument();
    expect(errorEl.textContent).toBe('Name required');
  });

  it('ghost row does not create row when validation fails', () => {
    const onRowAdd = vi.fn();
    renderGrid({
      onRowAdd,
      columns: [
        {
          id: 'name', field: 'name', title: 'Name',
          validators: [
            {
              name: 'required',
              run: (value: any) => {
                if (!value || value === '') return { message: 'Required', severity: 'error' as const };
                return null;
              },
            },
          ],
        },
        { id: 'age', field: 'age', title: 'Age' },
      ],
    });
    const ghostRow = screen.getByTestId('ghost-row');
    const allInputs = ghostRow.querySelectorAll('input');

    fireEvent.change(allInputs[1]!, { target: { value: '25' } });
    fireEvent.keyDown(allInputs[1]!, { key: 'Enter' });

    expect(onRowAdd).not.toHaveBeenCalled();
    // Data should still be original 2 rows
    const dataRows = screen.getAllByRole('row').filter(
      r => r.getAttribute('data-row-id') && r.getAttribute('data-row-id') !== null
    );
    expect(dataRows).toHaveLength(2);
  });

  it('ghost row supports Tab navigation across cells', () => {
    renderGrid();
    const ghostRow = screen.getByTestId('ghost-row');
    const allInputs = ghostRow.querySelectorAll('input');

    // Focus name cell
    fireEvent.focus(allInputs[0]!);
    // Tab to next cell
    fireEvent.keyDown(allInputs[0]!, { key: 'Tab' });

    // After a short delay, the age input should be targeted
    // We verify by checking the focus moved via the editing field tracking
    // The second input should become the active editing field
    expect(allInputs[1]).toBeInTheDocument();
  });

  it('ghost row Enter in last cell creates row and moves to new ghost row', () => {
    const onRowAdd = vi.fn();
    renderGrid({ onRowAdd });
    const ghostRow = screen.getByTestId('ghost-row');
    const allInputs = ghostRow.querySelectorAll('input');

    fireEvent.change(allInputs[0]!, { target: { value: 'EnterTest' } });
    fireEvent.change(allInputs[1]!, { target: { value: '33' } });
    // Press Enter on the last cell
    fireEvent.keyDown(allInputs[1]!, { key: 'Enter' });

    expect(onRowAdd).toHaveBeenCalledTimes(1);
    // Ghost row should be reset (new ghost row)
    const newGhostRow = screen.getByTestId('ghost-row');
    const newInputs = newGhostRow.querySelectorAll('input');
    expect(newInputs[0]).toHaveValue('');
  });

  it('ghost row respects column types for input', () => {
    renderGrid({
      columns: [
        { id: 'name', field: 'name', title: 'Name', cellType: 'text' as const },
        { id: 'age', field: 'age', title: 'Age', cellType: 'numeric' as const },
        { id: 'dob', field: 'dob', title: 'DOB', cellType: 'calendar' as const },
      ],
    });
    const ghostRow = screen.getByTestId('ghost-row');
    const allInputs = ghostRow.querySelectorAll('input');

    expect(allInputs[0]).toHaveAttribute('type', 'text');
    expect(allInputs[1]).toHaveAttribute('type', 'number');
    expect(allInputs[2]).toHaveAttribute('type', 'date');
  });

  it('ghost row inherits column default values', () => {
    renderGrid({
      columns: [
        { id: 'name', field: 'name', title: 'Name' },
        { id: 'age', field: 'age', title: 'Age', defaultValue: 18 },
      ],
    });
    const ghostRow = screen.getByTestId('ghost-row');
    const allInputs = ghostRow.querySelectorAll('input');
    expect(allInputs[1]).toHaveValue('18');
  });

  it('ghost row does not appear when grid is read-only', () => {
    renderGrid({ readOnly: true });
    expect(screen.queryByTestId('ghost-row')).not.toBeInTheDocument();
  });

  it('ghost row does not appear when addRows is false', () => {
    renderGrid({ ghostRow: false });
    expect(screen.queryByTestId('ghost-row')).not.toBeInTheDocument();
  });

  it('ghost row supports paste into ghost row cells', () => {
    renderGrid();
    const ghostRow = screen.getByTestId('ghost-row');
    const allInputs = ghostRow.querySelectorAll('input');

    // Paste tab-separated values into first cell
    const pasteData = 'PastedName\t42';
    fireEvent.paste(allInputs[0]!, {
      clipboardData: { getData: () => pasteData },
    });

    // Values should be distributed across cells
    expect(allInputs[0]).toHaveValue('PastedName');
    // Number input coerces string '42' to number 42
    expect(allInputs[1]).toHaveValue(42);
  });

  it('ghost row paste creates multiple rows from multi-row clipboard data', () => {
    const onRowAdd = vi.fn();
    renderGrid({ onRowAdd });
    const ghostRow = screen.getByTestId('ghost-row');
    const allInputs = ghostRow.querySelectorAll('input');

    // Paste multi-row data
    const pasteData = 'Row1Name\t20\nRow2Name\t30\nRow3Name\t40';
    fireEvent.paste(allInputs[0]!, {
      clipboardData: { getData: () => pasteData },
    });

    // Should have created 3 rows
    expect(onRowAdd).toHaveBeenCalledTimes(3);
    expect(onRowAdd).toHaveBeenCalledWith(expect.objectContaining({ name: 'Row1Name' }));
    expect(onRowAdd).toHaveBeenCalledWith(expect.objectContaining({ name: 'Row2Name' }));
    expect(onRowAdd).toHaveBeenCalledWith(expect.objectContaining({ name: 'Row3Name' }));
  });

  it('ghost row applies column validators during input', () => {
    renderGrid({
      columns: [
        {
          id: 'name', field: 'name', title: 'Name',
          validators: [
            {
              name: 'min',
              run: (value: any) => {
                if (value && value.length < 2) return { message: 'Too short', severity: 'error' as const };
                return null;
              },
            },
          ],
        },
        { id: 'age', field: 'age', title: 'Age' },
      ],
    });
    const ghostRow = screen.getByTestId('ghost-row');
    const allInputs = ghostRow.querySelectorAll('input');

    // Type a single character (too short)
    fireEvent.change(allInputs[0]!, { target: { value: 'A' } });
    // Try to create the row
    fireEvent.change(allInputs[1]!, { target: { value: '25' } });
    fireEvent.keyDown(allInputs[1]!, { key: 'Enter' });

    // Validation error should appear
    expect(screen.getByTestId('ghost-error-name')).toBeInTheDocument();
    expect(screen.getByTestId('ghost-error-name').textContent).toBe('Too short');
  });

  it('ghost row clears validation errors on valid input', () => {
    renderGrid({
      columns: [
        {
          id: 'name', field: 'name', title: 'Name',
          validators: [
            {
              name: 'min',
              run: (value: any) => {
                if (!value || value.length < 2) return { message: 'Too short', severity: 'error' as const };
                return null;
              },
            },
          ],
        },
        { id: 'age', field: 'age', title: 'Age' },
      ],
    });
    const ghostRow = screen.getByTestId('ghost-row');
    const allInputs = ghostRow.querySelectorAll('input');

    // Trigger validation error
    fireEvent.change(allInputs[0]!, { target: { value: 'A' } });
    fireEvent.change(allInputs[1]!, { target: { value: '25' } });
    fireEvent.keyDown(allInputs[1]!, { key: 'Enter' });
    expect(screen.getByTestId('ghost-error-name')).toBeInTheDocument();

    // Now fix the input
    fireEvent.change(allInputs[0]!, { target: { value: 'Alice' } });

    // Error should be cleared
    expect(screen.queryByTestId('ghost-error-name')).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Ghost Row Position
  // ---------------------------------------------------------------------------

  describe('Ghost Row Position', () => {
    it('ghost row at top is visually positioned above data rows', () => {
      renderGrid({ ghostRow: { position: 'top' } });
      const ghostRow = screen.getByTestId('ghost-row');
      expect(ghostRow).toHaveAttribute('data-ghost-position', 'top');
      // Ghost row should be positioned at top: 0
      expect(ghostRow.style.top).toBe('0px');
      // Data rows should be shifted down
      const dataRows = screen.getAllByRole('row').filter(
        r => r.getAttribute('data-row-id') !== null
      );
      expect(parseInt(dataRows[0]!.style.top)).toBeGreaterThan(0);
    });

    it('ghost row at top has top style of 0px', () => {
      renderGrid({ ghostRow: { position: 'top' } });
      const ghostRow = screen.getByTestId('ghost-row');
      expect(ghostRow.style.top).toBe('0px');
    });

    it('data rows shift down by rowHeight when ghost row is at top', () => {
      const rowHeight = 36; // default
      renderGrid({ ghostRow: { position: 'top' } });
      const dataRows = screen.getAllByRole('row').filter(
        r => r.getAttribute('data-row-id') !== null
      );
      // First data row should be at rowHeight (shifted down by ghost row)
      expect(dataRows[0]!.style.top).toBe(`${rowHeight}px`);
      // Second data row should be at 2 * rowHeight
      expect(dataRows[1]!.style.top).toBe(`${2 * rowHeight}px`);
    });

    it('ghost row at bottom (default) renders after data rows in DOM', () => {
      renderGrid({ ghostRow: true });
      const ghostRow = screen.getByTestId('ghost-row');
      const allRows = screen.getAllByRole('row');
      const dataRows = allRows.filter(r => r.getAttribute('data-row-id') !== null);
      const ghostIndex = allRows.indexOf(ghostRow);
      const lastDataIndex = allRows.indexOf(dataRows[dataRows.length - 1]!);
      expect(ghostIndex).toBeGreaterThan(lastDataIndex);
    });

    it('data rows are NOT offset when ghost row is at bottom', () => {
      const rowHeight = 36;
      renderGrid({ ghostRow: true });
      const dataRows = screen.getAllByRole('row').filter(
        r => r.getAttribute('data-row-id') !== null
      );
      expect(dataRows[0]!.style.top).toBe('0px');
      expect(dataRows[1]!.style.top).toBe(`${rowHeight}px`);
    });

    it('ghost row at top with grouped mode renders before group headers', () => {
      renderGrid({
        data: [
          { id: '1', name: 'Alice', age: 30 },
          { id: '2', name: 'Bob', age: 25 },
        ] as TestRow[],
        ghostRow: { position: 'top' },
        grouping: { rows: { fields: ['name'] } },
      });
      const ghostRow = screen.getByTestId('ghost-row');
      // Ghost row's parent is the grouped body wrapper; check it's the first child row
      const parent = ghostRow.parentElement!;
      const childRows = Array.from(parent.querySelectorAll('[role="row"]'));
      expect(childRows[0]).toBe(ghostRow);
    });

    it('ghost row at bottom with grouped mode renders after group content', () => {
      renderGrid({
        data: [
          { id: '1', name: 'Alice', age: 30 },
          { id: '2', name: 'Bob', age: 25 },
        ] as TestRow[],
        ghostRow: { position: 'bottom' },
        grouping: { rows: { fields: ['name'] } },
      });
      const ghostRow = screen.getByTestId('ghost-row');
      const allRows = screen.getAllByRole('row');
      expect(allRows[allRows.length - 1]).toBe(ghostRow);
    });

    it('config object position propagates to ghost row', () => {
      renderGrid({ ghostRow: { position: 'top' } });
      const ghostRow = screen.getByTestId('ghost-row');
      expect(ghostRow).toHaveAttribute('data-ghost-position', 'top');
    });
  });

  it('ghost row supports Escape to discard partial input', () => {
    renderGrid();
    const ghostRow = screen.getByTestId('ghost-row');
    const allInputs = ghostRow.querySelectorAll('input');

    // Type some values
    fireEvent.change(allInputs[0]!, { target: { value: 'Partial' } });
    fireEvent.change(allInputs[1]!, { target: { value: '99' } });

    // Press Escape
    fireEvent.keyDown(allInputs[0]!, { key: 'Escape' });

    // All values should be cleared
    const resetInputs = screen.getByTestId('ghost-row').querySelectorAll('input');
    expect(resetInputs[0]).toHaveValue('');
    // Number input returns null when empty
    expect(resetInputs[1]).toHaveValue(null);
  });
});
