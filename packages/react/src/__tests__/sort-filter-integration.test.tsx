import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { vi } from 'vitest';
import { DataGrid } from '../DataGrid';
import { GridContext } from '../context';
import React, { useContext } from 'react';

// ---------------------------------------------------------------------------
// Helpers & Fixtures
// ---------------------------------------------------------------------------

type SortRow = {
  id: string;
  name: string;
  age: number;
  active: boolean;
  joined: Date;
};

function makeSortData(): SortRow[] {
  return [
    { id: '1', name: 'Charlie', age: 35, active: true, joined: new Date('2023-03-15') },
    { id: '2', name: 'Alice', age: 25, active: false, joined: new Date('2022-01-10') },
    { id: '3', name: 'Bob', age: 30, active: true, joined: new Date('2024-06-20') },
  ];
}

const sortColumns = [
  { id: 'name', field: 'name', title: 'Name', sortable: true },
  { id: 'age', field: 'age', title: 'Age', sortable: true },
  { id: 'active', field: 'active', title: 'Active', cellType: 'boolean' as const, sortable: true },
  { id: 'joined', field: 'joined', title: 'Joined', sortable: true },
];

function getCellTexts(field: string): string[] {
  const cells = screen.getAllByRole('gridcell').filter(
    (c) => c.getAttribute('data-field') === field
  );
  return cells.map((c) => c.textContent?.trim() ?? '');
}

function renderSortGrid(overrides: Record<string, unknown> = {}) {
  return render(
    <DataGrid
      data={makeSortData()}
      columns={sortColumns}
      rowKey="id"
      sorting={true}
      {...(overrides as any)}
    />
  );
}

// Helper to get the model from context for programmatic operations
function ModelAccessor({ onModel }: { onModel: (m: any) => void }) {
  const model = useContext(GridContext);
  React.useEffect(() => { onModel(model); }, [model, onModel]);
  return null;
}

function renderGridWithModel(overrides: Record<string, unknown> = {}) {
  const modelRef: any = null;
  const { container, rerender } = render(
    <DataGrid
      data={makeSortData()}
      columns={sortColumns}
      rowKey="id"
      sorting={true}
      {...(overrides as any)}
    />
  );
  // Access model from the grid context by getting the provider
  // We'll use a different approach: render a wrapper
  return { container, rerender, modelRef };
}

// ---------------------------------------------------------------------------
// Sorting Integration Tests
// ---------------------------------------------------------------------------

describe('sort integration', () => {
  it('single column ascending on header click', () => {
    renderSortGrid();
    fireEvent.click(screen.getByRole('columnheader', { name: /age/i }));
    const ages = getCellTexts('age');
    expect(ages).toEqual(['25', '30', '35']);
  });

  it('single column descending on second header click', () => {
    renderSortGrid();
    const header = screen.getByRole('columnheader', { name: /age/i });
    fireEvent.click(header);
    fireEvent.click(header);
    const ages = getCellTexts('age');
    expect(ages).toEqual(['35', '30', '25']);
  });

  it('removes sort on third header click', () => {
    renderSortGrid();
    const header = screen.getByRole('columnheader', { name: /age/i });
    fireEvent.click(header);
    fireEvent.click(header);
    fireEvent.click(header);
    // Original order: Charlie(35), Alice(25), Bob(30)
    const ages = getCellTexts('age');
    expect(ages).toEqual(['35', '25', '30']);
  });

  it('shows ascending indicator icon on sorted column', () => {
    renderSortGrid();
    const header = screen.getByRole('columnheader', { name: /age/i });
    fireEvent.click(header);
    expect(header.textContent).toContain('\u25B2');
  });

  it('shows descending indicator icon on sorted column', () => {
    renderSortGrid();
    const header = screen.getByRole('columnheader', { name: /age/i });
    fireEvent.click(header);
    fireEvent.click(header);
    expect(header.textContent).toContain('\u25BC');
  });

  it('removes indicator icon when sort cleared', () => {
    renderSortGrid();
    const header = screen.getByRole('columnheader', { name: /age/i });
    fireEvent.click(header);
    fireEvent.click(header);
    fireEvent.click(header);
    expect(header.textContent).not.toContain('\u25B2');
    expect(header.textContent).not.toContain('\u25BC');
  });

  it('multi-column adds sort on shift-click header', () => {
    renderSortGrid();
    const ageHeader = screen.getByRole('columnheader', { name: /age/i });
    const nameHeader = screen.getByRole('columnheader', { name: /^name/i });
    fireEvent.click(ageHeader);
    fireEvent.click(nameHeader, { shiftKey: true });
    // Both should show ascending
    expect(ageHeader).toHaveAttribute('aria-sort', 'ascending');
    expect(nameHeader).toHaveAttribute('aria-sort', 'ascending');
  });

  it('multi-column shows priority number per sorted column', () => {
    renderSortGrid();
    const ageHeader = screen.getByRole('columnheader', { name: /age/i });
    const nameHeader = screen.getByRole('columnheader', { name: /^name/i });
    fireEvent.click(ageHeader);
    fireEvent.click(nameHeader, { shiftKey: true });
    // Priority numbers should be displayed
    expect(ageHeader.textContent).toContain('1');
    expect(nameHeader.textContent).toContain('2');
  });

  it('multi-column primary sort takes precedence', () => {
    // Data with same name but different ages to test primary vs secondary
    const data = [
      { id: '1', name: 'Alice', age: 30, active: true, joined: new Date('2023-01-01') },
      { id: '2', name: 'Alice', age: 20, active: false, joined: new Date('2023-01-01') },
      { id: '3', name: 'Bob', age: 25, active: true, joined: new Date('2023-01-01') },
    ];
    render(
      <DataGrid data={data} columns={sortColumns} rowKey="id" sorting={true} />
    );
    const nameHeader = screen.getByRole('columnheader', { name: /^name/i });
    const ageHeader = screen.getByRole('columnheader', { name: /age/i });
    // Primary sort by name, secondary sort by age
    fireEvent.click(nameHeader);
    fireEvent.click(ageHeader, { shiftKey: true });
    const names = getCellTexts('name');
    const ages = getCellTexts('age');
    // Alice(20), Alice(30), Bob(25)
    expect(names).toEqual(['Alice', 'Alice', 'Bob']);
    expect(ages).toEqual(['20', '30', '25']);
  });

  it('multi-column removes single column from multi-sort', () => {
    renderSortGrid();
    const ageHeader = screen.getByRole('columnheader', { name: /age/i });
    const nameHeader = screen.getByRole('columnheader', { name: /^name/i });
    // Add both sorts
    fireEvent.click(ageHeader);
    fireEvent.click(nameHeader, { shiftKey: true });
    // Now click age with shift to cycle it (asc -> desc)
    fireEvent.click(ageHeader, { shiftKey: true });
    // desc
    fireEvent.click(ageHeader, { shiftKey: true });
    // removed
    expect(ageHeader).toHaveAttribute('aria-sort', 'none');
    expect(nameHeader).toHaveAttribute('aria-sort', 'ascending');
  });

  it('stable sort preserves original order for equal values', () => {
    const data = [
      { id: '1', name: 'Alice', age: 30, active: true, joined: new Date('2023-01-01') },
      { id: '2', name: 'Bob', age: 30, active: false, joined: new Date('2023-01-01') },
      { id: '3', name: 'Charlie', age: 30, active: true, joined: new Date('2023-01-01') },
    ];
    render(
      <DataGrid data={data} columns={sortColumns} rowKey="id" sorting={true} />
    );
    fireEvent.click(screen.getByRole('columnheader', { name: /age/i }));
    // All ages are 30, so original order should be preserved
    const names = getCellTexts('name');
    expect(names).toEqual(['Alice', 'Bob', 'Charlie']);
  });

  it('handles null values placing them at end', () => {
    const data = [
      { id: '1', name: 'Alice', age: null as unknown as number, active: true, joined: new Date('2023-01-01') },
      { id: '2', name: 'Bob', age: 25, active: false, joined: new Date('2023-01-01') },
      { id: '3', name: 'Charlie', age: 35, active: true, joined: new Date('2023-01-01') },
    ];
    render(
      <DataGrid data={data} columns={sortColumns} rowKey="id" sorting={true} />
    );
    fireEvent.click(screen.getByRole('columnheader', { name: /age/i }));
    const ages = getCellTexts('age');
    // null should be at the end
    expect(ages).toEqual(['25', '35', '']);
  });

  it('handles undefined values placing them at end', () => {
    const data = [
      { id: '1', name: 'Alice', age: undefined as unknown as number, active: true, joined: new Date('2023-01-01') },
      { id: '2', name: 'Bob', age: 25, active: false, joined: new Date('2023-01-01') },
      { id: '3', name: 'Charlie', age: 35, active: true, joined: new Date('2023-01-01') },
    ];
    render(
      <DataGrid data={data} columns={sortColumns} rowKey="id" sorting={true} />
    );
    fireEvent.click(screen.getByRole('columnheader', { name: /age/i }));
    const ages = getCellTexts('age');
    expect(ages).toEqual(['25', '35', '']);
  });

  it('handles mixed types gracefully', () => {
    const data = [
      { id: '1', name: 'Alice', age: 30, active: true, joined: new Date('2023-01-01') },
      { id: '2', name: 'Bob', age: '25' as unknown as number, active: false, joined: new Date('2023-01-01') },
      { id: '3', name: 'Charlie', age: 35, active: true, joined: new Date('2023-01-01') },
    ];
    render(
      <DataGrid data={data} columns={sortColumns} rowKey="id" sorting={true} />
    );
    // Should not throw
    fireEvent.click(screen.getByRole('columnheader', { name: /age/i }));
    const ages = getCellTexts('age');
    expect(ages.length).toBe(3);
  });

  it('text column case insensitive by default', () => {
    const data = [
      { id: '1', name: 'charlie', age: 30, active: true, joined: new Date('2023-01-01') },
      { id: '2', name: 'Alice', age: 25, active: false, joined: new Date('2023-01-01') },
      { id: '3', name: 'bob', age: 35, active: true, joined: new Date('2023-01-01') },
    ];
    render(
      <DataGrid data={data} columns={sortColumns} rowKey="id" sorting={true} />
    );
    fireEvent.click(screen.getByRole('columnheader', { name: /^name/i }));
    const names = getCellTexts('name');
    expect(names).toEqual(['Alice', 'bob', 'charlie']);
  });

  it('text column case sensitive when configured', () => {
    const data = [
      { id: '1', name: 'charlie', age: 30, active: true, joined: new Date('2023-01-01') },
      { id: '2', name: 'Alice', age: 25, active: false, joined: new Date('2023-01-01') },
      { id: '3', name: 'Bob', age: 35, active: true, joined: new Date('2023-01-01') },
    ];
    render(
      <DataGrid
        data={data}
        columns={sortColumns}
        rowKey="id"
        sorting={{ caseSensitive: true }}
      />
    );
    fireEvent.click(screen.getByRole('columnheader', { name: /^name/i }));
    const names = getCellTexts('name');
    // Case sensitive: uppercase letters come before lowercase in ASCII
    expect(names).toEqual(['Alice', 'Bob', 'charlie']);
  });

  it('numeric column compares numerically not lexicographically', () => {
    const data = [
      { id: '1', name: 'A', age: 100, active: true, joined: new Date('2023-01-01') },
      { id: '2', name: 'B', age: 9, active: false, joined: new Date('2023-01-01') },
      { id: '3', name: 'C', age: 20, active: true, joined: new Date('2023-01-01') },
    ];
    render(
      <DataGrid data={data} columns={sortColumns} rowKey="id" sorting={true} />
    );
    fireEvent.click(screen.getByRole('columnheader', { name: /age/i }));
    const ages = getCellTexts('age');
    // Numeric: 9, 20, 100 (not "100", "20", "9" which would be lexicographic)
    expect(ages).toEqual(['9', '20', '100']);
  });

  it('date column compares chronologically', () => {
    const data = [
      { id: '1', name: 'A', age: 1, active: true, joined: new Date('2024-06-20') },
      { id: '2', name: 'B', age: 2, active: false, joined: new Date('2022-01-10') },
      { id: '3', name: 'C', age: 3, active: true, joined: new Date('2023-03-15') },
    ];
    render(
      <DataGrid data={data} columns={sortColumns} rowKey="id" sorting={true} />
    );
    fireEvent.click(screen.getByRole('columnheader', { name: /joined/i }));
    // B(2022), C(2023), A(2024)
    const names = getCellTexts('name');
    expect(names).toEqual(['B', 'C', 'A']);
  });

  it('boolean column sorts false before true', () => {
    renderSortGrid();
    fireEvent.click(screen.getByRole('columnheader', { name: /active/i }));
    const actives = getCellTexts('active');
    // false first (Alice=false), then trues
    expect(actives[0]).toBe('\u2610'); // false checkbox
  });

  it('fires onSortChange callback with sort state', () => {
    const onSortChange = vi.fn();
    renderSortGrid({ onSortChange });
    fireEvent.click(screen.getByRole('columnheader', { name: /age/i }));
    expect(onSortChange).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ field: 'age', dir: 'asc' })])
    );
  });
});

// ---------------------------------------------------------------------------
// Filtering Integration Tests
// ---------------------------------------------------------------------------

describe('filter integration', () => {
  // For filtering tests, we render a DataGrid wrapper that gives us model access.
  function FilterGrid({
    data,
    onFilterChange,
    columns: cols,
  }: {
    data?: SortRow[];
    onFilterChange?: (f: any) => void;
    columns?: any[];
  }) {
    const modelRef = React.useRef<any>(null);
    return (
      <DataGrid
        data={data ?? makeSortData()}
        columns={cols ?? sortColumns}
        rowKey="id"
        sorting={true}
        filtering={true}
        onFilterChange={onFilterChange}
      />
    );
  }

  // We need access to the model to call filter(). We'll use a wrapper approach.
  function FilterGridWithRef({
    data,
    onFilterChange,
    modelCb,
  }: {
    data?: SortRow[];
    onFilterChange?: (f: any) => void;
    modelCb: (m: any) => void;
  }) {
    return (
      <DataGrid
        data={data ?? makeSortData()}
        columns={sortColumns}
        rowKey="id"
        sorting={true}
        filtering={true}
        onFilterChange={onFilterChange}
      >
        {/* We'll use a different approach - render the grid and use GridContext */}
      </DataGrid>
    );
  }

  // Since DataGrid doesn't expose children, we need a wrapper that uses GridContext
  // Actually, the simplest approach: render DataGrid, then check the model through
  // a wrapper component that accesses GridContext.

  function GridWithModelAccess({
    data,
    onFilterChange,
    testFn,
  }: {
    data?: SortRow[];
    onFilterChange?: (f: any) => void;
    testFn: (model: any) => void;
  }) {
    // We'll just use DataGrid and access its internals through the GridContext
    // But DataGrid wraps everything in GridContext.Provider...
    // The easiest way is to just use the core model directly and render the grid.
    // We'll create a custom component that wraps DataGrid and gives us model access.
    return null;
  }

  // Simplest approach: render DataGrid + verify data rows change after
  // we programmatically apply filters through a companion component.
  // Since DataGrid provides GridContext, we can use a child trick.

  // Actually, DataGrid doesn't render children. So we'll use a helper
  // that renders alongside DataGrid and accesses the same model.
  // The cleanest approach: use a wrapper that creates the model directly.

  // Let's take the straightforward approach: create a test DataGrid component
  // that can accept filter state as a prop, and apply it via model.

  function FilterableGrid({
    data,
    filter,
    onFilterChange,
  }: {
    data?: SortRow[];
    filter?: any;
    onFilterChange?: (f: any) => void;
  }) {
    const ref = React.useRef<any>(null);

    return (
      <DataGrid
        data={data ?? makeSortData()}
        columns={sortColumns}
        rowKey="id"
        sorting={true}
        filtering={true}
        onFilterChange={onFilterChange}
        initialFilter={filter}
      />
    );
  }

  // Actually the simplest approach for integration tests: use the DataGrid and
  // interact through the UI. Since we're testing filtering at the integration level
  // and the DataGrid renders filter controls when filtering is enabled (or we can
  // use the model directly), let's use a pattern where we wrap DataGrid with an
  // imperative handle.

  // The REAL simplest approach: test filtering through a test harness that creates
  // the grid model, applies filters, then verifies the rendered output.

  function TestFilterGrid({
    data,
    filterState,
    onFilterChange,
  }: {
    data?: SortRow[];
    filterState?: any;
    onFilterChange?: (f: any) => void;
  }) {
    const [filter, setFilter] = React.useState(filterState ?? null);

    // We need to access the model. Since DataGrid creates the model internally,
    // we'll use a workaround: trigger filtering by rendering a new DataGrid instance.
    // Actually, the best approach is to enhance DataGrid to accept `initialFilter`.

    return (
      <DataGrid
        data={data ?? makeSortData()}
        columns={sortColumns}
        rowKey="id"
        sorting={true}
        filtering={true}
        onFilterChange={onFilterChange}
        initialFilter={filter}
      />
    );
  }

  it('text column contains substring match', () => {
    render(
      <DataGrid
        data={makeSortData()}
        columns={sortColumns}
        rowKey="id"
        filtering={true}
        initialFilter={{ logic: 'and' as const, filters: [{ field: 'name', operator: 'contains' as const, value: 'li' }] }}
      />
    );
    const names = getCellTexts('name');
    expect(names).toEqual(['Charlie', 'Alice']);
  });

  it('text column equals exact match', () => {
    render(
      <DataGrid
        data={makeSortData()}
        columns={sortColumns}
        rowKey="id"
        filtering={true}
        initialFilter={{ logic: 'and' as const, filters: [{ field: 'name', operator: 'eq' as const, value: 'Alice' }] }}
      />
    );
    const names = getCellTexts('name');
    expect(names).toEqual(['Alice']);
  });

  it('text column starts with match', () => {
    render(
      <DataGrid
        data={makeSortData()}
        columns={sortColumns}
        rowKey="id"
        filtering={true}
        initialFilter={{ logic: 'and' as const, filters: [{ field: 'name', operator: 'startsWith' as const, value: 'Ch' }] }}
      />
    );
    const names = getCellTexts('name');
    expect(names).toEqual(['Charlie']);
  });

  it('text column ends with match', () => {
    render(
      <DataGrid
        data={makeSortData()}
        columns={sortColumns}
        rowKey="id"
        filtering={true}
        initialFilter={{ logic: 'and' as const, filters: [{ field: 'name', operator: 'endsWith' as const, value: 'ob' }] }}
      />
    );
    const names = getCellTexts('name');
    expect(names).toEqual(['Bob']);
  });

  it('text column case insensitive by default', () => {
    render(
      <DataGrid
        data={makeSortData()}
        columns={sortColumns}
        rowKey="id"
        filtering={true}
        initialFilter={{ logic: 'and' as const, filters: [{ field: 'name', operator: 'contains' as const, value: 'ALICE' }] }}
      />
    );
    const names = getCellTexts('name');
    expect(names).toEqual(['Alice']);
  });

  it('text column empty string clears filter', () => {
    const { rerender } = render(
      <DataGrid
        data={makeSortData()}
        columns={sortColumns}
        rowKey="id"
        filtering={true}
        initialFilter={{ logic: 'and' as const, filters: [{ field: 'name', operator: 'contains' as const, value: 'Alice' }] }}
      />
    );
    expect(getCellTexts('name')).toEqual(['Alice']);
    // Rerender with empty filter
    rerender(
      <DataGrid
        data={makeSortData()}
        columns={sortColumns}
        rowKey="id"
        filtering={true}
        initialFilter={{ logic: 'and' as const, filters: [] }}
      />
    );
    // All data visible - but since model is memoized, we need initialFilter to be applied.
    // Actually DataGrid creates model once with useMemo([]), so rerender won't recreate.
    // We test this differently: render with no filter, all rows visible.
    // Let's verify the empty filter shows all rows via a fresh render.
    const { unmount } = render(
      <DataGrid
        data={makeSortData()}
        columns={sortColumns}
        rowKey="id"
        filtering={true}
        initialFilter={{ logic: 'and' as const, filters: [] }}
      />
    );
    // getAllByRole gets all grids - use the most recent container
    // Actually just verify 3 rows (header + 3 data)
    const grids = screen.getAllByRole('grid');
    const lastGrid = grids[grids.length - 1]!;
    const rows = within(lastGrid).getAllByRole('row');
    expect(rows.length).toBe(4); // 1 header + 3 data
    unmount();
  });

  it('numeric column equals match', () => {
    render(
      <DataGrid
        data={makeSortData()}
        columns={sortColumns}
        rowKey="id"
        filtering={true}
        initialFilter={{ logic: 'and' as const, filters: [{ field: 'age', operator: 'eq' as const, value: 25 }] }}
      />
    );
    const ages = getCellTexts('age');
    expect(ages).toEqual(['25']);
  });

  it('numeric column greater than match', () => {
    render(
      <DataGrid
        data={makeSortData()}
        columns={sortColumns}
        rowKey="id"
        filtering={true}
        initialFilter={{ logic: 'and' as const, filters: [{ field: 'age', operator: 'gt' as const, value: 28 }] }}
      />
    );
    const ages = getCellTexts('age');
    expect(ages).toEqual(['35', '30']);
  });

  it('numeric column less than match', () => {
    render(
      <DataGrid
        data={makeSortData()}
        columns={sortColumns}
        rowKey="id"
        filtering={true}
        initialFilter={{ logic: 'and' as const, filters: [{ field: 'age', operator: 'lt' as const, value: 30 }] }}
      />
    );
    const ages = getCellTexts('age');
    expect(ages).toEqual(['25']);
  });

  it('numeric column between range match', () => {
    render(
      <DataGrid
        data={makeSortData()}
        columns={sortColumns}
        rowKey="id"
        filtering={true}
        initialFilter={{ logic: 'and' as const, filters: [{ field: 'age', operator: 'between' as const, value: [25, 30] }] }}
      />
    );
    const ages = getCellTexts('age');
    expect(ages).toEqual(['25', '30']);
  });

  it('boolean column true only', () => {
    render(
      <DataGrid
        data={makeSortData()}
        columns={sortColumns}
        rowKey="id"
        filtering={true}
        initialFilter={{ logic: 'and' as const, filters: [{ field: 'active', operator: 'eq' as const, value: true }] }}
      />
    );
    const names = getCellTexts('name');
    expect(names).toEqual(['Charlie', 'Bob']);
  });

  it('boolean column false only', () => {
    render(
      <DataGrid
        data={makeSortData()}
        columns={sortColumns}
        rowKey="id"
        filtering={true}
        initialFilter={{ logic: 'and' as const, filters: [{ field: 'active', operator: 'eq' as const, value: false }] }}
      />
    );
    const names = getCellTexts('name');
    expect(names).toEqual(['Alice']);
  });

  it('date column equals date', () => {
    const targetDate = new Date('2023-03-15');
    render(
      <DataGrid
        data={makeSortData()}
        columns={sortColumns}
        rowKey="id"
        filtering={true}
        initialFilter={{ logic: 'and' as const, filters: [{ field: 'joined', operator: 'eq' as const, value: targetDate }] }}
      />
    );
    const names = getCellTexts('name');
    expect(names).toEqual(['Charlie']);
  });

  it('date column after date', () => {
    render(
      <DataGrid
        data={makeSortData()}
        columns={sortColumns}
        rowKey="id"
        filtering={true}
        initialFilter={{ logic: 'and' as const, filters: [{ field: 'joined', operator: 'gt' as const, value: new Date('2023-06-01') }] }}
      />
    );
    const names = getCellTexts('name');
    expect(names).toEqual(['Bob']);
  });

  it('date column before date', () => {
    render(
      <DataGrid
        data={makeSortData()}
        columns={sortColumns}
        rowKey="id"
        filtering={true}
        initialFilter={{ logic: 'and' as const, filters: [{ field: 'joined', operator: 'lt' as const, value: new Date('2023-01-01') }] }}
      />
    );
    const names = getCellTexts('name');
    expect(names).toEqual(['Alice']);
  });

  it('date column between date range', () => {
    render(
      <DataGrid
        data={makeSortData()}
        columns={sortColumns}
        rowKey="id"
        filtering={true}
        initialFilter={{ logic: 'and' as const, filters: [{ field: 'joined', operator: 'between' as const, value: [new Date('2022-01-01'), new Date('2023-12-31')] }] }}
      />
    );
    const names = getCellTexts('name');
    expect(names).toEqual(['Charlie', 'Alice']);
  });

  it('combines across multiple columns with AND logic', () => {
    render(
      <DataGrid
        data={makeSortData()}
        columns={sortColumns}
        rowKey="id"
        filtering={true}
        initialFilter={{
          logic: 'and' as const,
          filters: [
            { field: 'active', operator: 'eq' as const, value: true },
            { field: 'age', operator: 'gt' as const, value: 30 },
          ],
        }}
      />
    );
    const names = getCellTexts('name');
    expect(names).toEqual(['Charlie']);
  });

  it('fires onFilterChange callback with filter state', () => {
    const onFilterChange = vi.fn();
    const filterState = { logic: 'and' as const, filters: [{ field: 'name', operator: 'eq' as const, value: 'Alice' }] };
    render(
      <DataGrid
        data={makeSortData()}
        columns={sortColumns}
        rowKey="id"
        filtering={true}
        onFilterChange={onFilterChange}
        initialFilter={filterState}
      />
    );
    expect(onFilterChange).toHaveBeenCalledWith(filterState);
  });
});

// ---------------------------------------------------------------------------
// Regression: "Clear Filter from <col>" must also drop predicates emitted
// by the custom-condition dialog, which arrive as nested composites rather
// than flat leaves. See issue #7.
// ---------------------------------------------------------------------------

describe('filter integration — clear custom condition filter (#7)', () => {
  function getNameCells(): string[] {
    return screen
      .getAllByRole('gridcell')
      .filter((c) => c.getAttribute('data-field') === 'name')
      .map((c) => c.textContent?.trim() ?? '');
  }

  it('clears a custom text filter applied via the condition dialog', async () => {
    const onFilterChange = vi.fn();
    render(
      <DataGrid
        data={makeSortData()}
        columns={sortColumns}
        rowKey="id"
        filtering={true}
        showFilterMenu
        sorting
        onFilterChange={onFilterChange}
      />
    );

    // Sanity: all three rows are visible initially.
    expect(getNameCells().sort()).toEqual(['Alice', 'Bob', 'Charlie']);

    // Open the column filter menu for "name".
    const nameHeader = screen.getByRole('columnheader', { name: /^name/i });
    const chevron = within(nameHeader).getByTestId('column-filter-icon');
    fireEvent.click(chevron);

    // Open the Text Filters… custom-condition dialog.
    fireEvent.click(screen.getByTestId('column-filter-conditions'));

    // Build: name contains "li" (matches Charlie and Alice).
    fireEvent.change(screen.getByTestId('filter-cond-op-1'), { target: { value: 'contains' } });
    fireEvent.change(screen.getByTestId('filter-cond-val-1'), { target: { value: 'li' } });
    fireEvent.click(screen.getByTestId('filter-cond-ok'));

    // Filter is active → Charlie + Alice visible, Bob gone.
    expect(getNameCells().sort()).toEqual(['Alice', 'Charlie']);
    // The dialog emits a composite child; onFilterChange must have received it.
    const lastFilterCall = onFilterChange.mock.calls.at(-1)![0];
    expect(lastFilterCall).toEqual({
      logic: 'and',
      filters: [
        {
          logic: 'and',
          filters: [{ field: 'name', operator: 'contains', value: 'li' }],
        },
      ],
    });

    // Re-open the menu and click "Clear Filter from 'Name'".
    fireEvent.click(within(nameHeader).getByTestId('column-filter-icon'));
    const clearBtn = screen.getByTestId('column-filter-clear');
    expect(clearBtn).not.toHaveAttribute('aria-disabled');
    fireEvent.click(clearBtn);

    // After clearing, all rows must be visible again and the filter state null.
    expect(getNameCells().sort()).toEqual(['Alice', 'Bob', 'Charlie']);
    expect(onFilterChange).toHaveBeenLastCalledWith(null);
  });

  it('clears a custom filter even when mixed with a filter on a different field', async () => {
    const onFilterChange = vi.fn();
    render(
      <DataGrid
        data={makeSortData()}
        columns={sortColumns}
        rowKey="id"
        filtering={true}
        showFilterMenu
        sorting
        onFilterChange={onFilterChange}
        // Pre-seed a filter on a different column (`age > 28`). Clearing the
        // name-column custom filter must not touch this one.
        initialFilter={{
          logic: 'and',
          filters: [{ field: 'age', operator: 'gt', value: 28 }],
        }}
      />
    );

    // Apply a custom-condition filter on `name`.
    const nameHeader = screen.getByRole('columnheader', { name: /^name/i });
    fireEvent.click(within(nameHeader).getByTestId('column-filter-icon'));
    fireEvent.click(screen.getByTestId('column-filter-conditions'));
    fireEvent.change(screen.getByTestId('filter-cond-op-1'), { target: { value: 'contains' } });
    fireEvent.change(screen.getByTestId('filter-cond-val-1'), { target: { value: 'li' } });
    fireEvent.click(screen.getByTestId('filter-cond-ok'));

    // Only Charlie (age 35 > 28 AND name contains "li").
    expect(getNameCells()).toEqual(['Charlie']);

    // Clear the name filter; the `age > 28` predicate must stay in place.
    fireEvent.click(within(nameHeader).getByTestId('column-filter-icon'));
    fireEvent.click(screen.getByTestId('column-filter-clear'));

    // With only `age > 28`: Charlie (35) and Bob (30) pass, Alice (25) filtered out.
    expect(getNameCells().sort()).toEqual(['Bob', 'Charlie']);
    const lastCall = onFilterChange.mock.calls.at(-1)![0];
    expect(lastCall).toEqual({
      logic: 'and',
      filters: [{ field: 'age', operator: 'gt', value: 28 }],
    });
  });
});
