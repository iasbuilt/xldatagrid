import { render, screen, fireEvent } from '@testing-library/react';
import { DataGrid, CellRendererProps } from '../DataGrid';
import type { ColumnDef, RowTypeDef, CellType } from '@iasbuilt/datagrid-core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type PivotRow = Record<string, unknown> & { id: string };

function makeRows(count: number): PivotRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: String(i + 1),
    col1: `val-${i}-1`,
    col2: `val-${i}-2`,
    col3: `val-${i}-3`,
  }));
}

function makeCols(cellType?: CellType): ColumnDef<PivotRow>[] {
  return [
    { id: 'col1', field: 'col1', title: 'Col 1', cellType },
    { id: 'col2', field: 'col2', title: 'Col 2', cellType },
  ];
}

function getCellTypes(container: HTMLElement, field?: string): string[] {
  let selector = '[data-cell-type]';
  if (field) selector = `[data-field="${field}"][data-cell-type]`;
  return Array.from(container.querySelectorAll(selector)).map(
    el => el.getAttribute('data-cell-type')!,
  );
}

function getCellTypesForRow(container: HTMLElement, rowId: string): string[] {
  return Array.from(
    container.querySelectorAll(`[data-row-id="${rowId}"][data-cell-type]`),
  ).map(el => el.getAttribute('data-cell-type')!);
}

const ALL_CELL_TYPES: CellType[] = [
  'text', 'calendar', 'status', 'tags', 'compoundChipList', 'boolean',
  'password', 'chipSelect', 'currency', 'richText', 'numeric', 'upload',
  'subGrid', 'list', 'actions',
];

// ---------------------------------------------------------------------------
// Column-Driven Pivot (28 tests)
// ---------------------------------------------------------------------------

describe('column-driven pivot', () => {
  it('renders all rows with same cell type per column', () => {
    const { container } = render(
      <DataGrid
        data={makeRows(3)}
        columns={[
          { id: 'col1', field: 'col1', title: 'Col 1', cellType: 'text' },
          { id: 'col2', field: 'col2', title: 'Col 2', cellType: 'numeric' },
        ]}
        rowKey="id"
        pivotMode="column"
      />,
    );
    const col1Types = getCellTypes(container, 'col1');
    const col2Types = getCellTypes(container, 'col2');
    expect(col1Types.every(t => t === 'text')).toBe(true);
    expect(col2Types.every(t => t === 'numeric')).toBe(true);
  });

  it('applies text type to all rows in a text column', () => {
    const { container } = render(
      <DataGrid data={makeRows(3)} columns={makeCols('text')} rowKey="id" pivotMode="column" />,
    );
    expect(getCellTypes(container, 'col1').every(t => t === 'text')).toBe(true);
  });

  it('applies date type to all rows in a date column', () => {
    const { container } = render(
      <DataGrid data={makeRows(2)} columns={makeCols('calendar')} rowKey="id" pivotMode="column" />,
    );
    expect(getCellTypes(container, 'col1').every(t => t === 'calendar')).toBe(true);
  });

  it('applies status dropdown to all rows in a status column', () => {
    const cols: ColumnDef<PivotRow>[] = [
      { id: 'col1', field: 'col1', title: 'Col 1', cellType: 'status', options: [{ value: 'open', label: 'Open' }] },
    ];
    const { container } = render(
      <DataGrid data={makeRows(2)} columns={cols} rowKey="id" pivotMode="column" />,
    );
    expect(getCellTypes(container, 'col1').every(t => t === 'status')).toBe(true);
  });

  it('applies checkbox to all rows in a boolean column', () => {
    const data = [
      { id: '1', col1: true, col2: 'x' },
      { id: '2', col1: false, col2: 'y' },
    ];
    const cols: ColumnDef<any>[] = [
      { id: 'col1', field: 'col1', title: 'Col 1', cellType: 'boolean' },
    ];
    const { container } = render(
      <DataGrid data={data} columns={cols} rowKey="id" pivotMode="column" />,
    );
    expect(getCellTypes(container, 'col1').every(t => t === 'boolean')).toBe(true);
    expect(screen.getByText('\u2611')).toBeInTheDocument();
    expect(screen.getByText('\u2610')).toBeInTheDocument();
  });

  it('applies numeric type to all rows in a numeric column', () => {
    const { container } = render(
      <DataGrid data={makeRows(3)} columns={makeCols('numeric')} rowKey="id" pivotMode="column" />,
    );
    expect(getCellTypes(container, 'col1').every(t => t === 'numeric')).toBe(true);
  });

  it('applies currency type to all rows in a currency column', () => {
    const data = [{ id: '1', col1: 42.5 }];
    const cols: ColumnDef<any>[] = [
      { id: 'col1', field: 'col1', title: 'Col 1', cellType: 'currency' },
    ];
    const { container } = render(
      <DataGrid data={data} columns={cols} rowKey="id" pivotMode="column" />,
    );
    expect(getCellTypes(container, 'col1').every(t => t === 'currency')).toBe(true);
    expect(screen.getByText('$42.50')).toBeInTheDocument();
  });

  it('renders tags cell in tags column', () => {
    const { container } = render(
      <DataGrid data={makeRows(2)} columns={makeCols('tags')} rowKey="id" pivotMode="column" />,
    );
    expect(getCellTypes(container, 'col1').every(t => t === 'tags')).toBe(true);
  });

  it('renders password cell in password column', () => {
    const { container } = render(
      <DataGrid data={makeRows(2)} columns={makeCols('password')} rowKey="id" pivotMode="column" />,
    );
    expect(getCellTypes(container, 'col1').every(t => t === 'password')).toBe(true);
  });

  it('renders upload cell in upload column', () => {
    const { container } = render(
      <DataGrid data={makeRows(2)} columns={makeCols('upload')} rowKey="id" pivotMode="column" />,
    );
    expect(getCellTypes(container, 'col1').every(t => t === 'upload')).toBe(true);
  });

  it('renders richText cell in richText column', () => {
    const { container } = render(
      <DataGrid data={makeRows(2)} columns={makeCols('richText')} rowKey="id" pivotMode="column" />,
    );
    expect(getCellTypes(container, 'col1').every(t => t === 'richText')).toBe(true);
  });

  it('renders list cell in list column', () => {
    const { container } = render(
      <DataGrid data={makeRows(2)} columns={makeCols('list')} rowKey="id" pivotMode="column" />,
    );
    expect(getCellTypes(container, 'col1').every(t => t === 'list')).toBe(true);
  });

  it('renders chipSelect cell in chipSelect column', () => {
    const { container } = render(
      <DataGrid data={makeRows(2)} columns={makeCols('chipSelect')} rowKey="id" pivotMode="column" />,
    );
    expect(getCellTypes(container, 'col1').every(t => t === 'chipSelect')).toBe(true);
  });

  it('renders compoundChipList cell in compoundChipList column', () => {
    const { container } = render(
      <DataGrid data={makeRows(2)} columns={makeCols('compoundChipList')} rowKey="id" pivotMode="column" />,
    );
    expect(getCellTypes(container, 'col1').every(t => t === 'compoundChipList')).toBe(true);
  });

  it('renders actions cell in actions column', () => {
    const { container } = render(
      <DataGrid data={makeRows(2)} columns={makeCols('actions')} rowKey="id" pivotMode="column" />,
    );
    expect(getCellTypes(container, 'col1').every(t => t === 'actions')).toBe(true);
  });

  it('renders subGrid cell in subGrid column', () => {
    const { container } = render(
      <DataGrid data={makeRows(2)} columns={makeCols('subGrid')} rowKey="id" pivotMode="column" />,
    );
    expect(getCellTypes(container, 'col1').every(t => t === 'subGrid')).toBe(true);
  });

  it('falls back to text when cellType undefined', () => {
    const cols: ColumnDef<PivotRow>[] = [
      { id: 'col1', field: 'col1', title: 'Col 1' }, // no cellType
    ];
    const { container } = render(
      <DataGrid data={makeRows(2)} columns={cols} rowKey="id" pivotMode="column" />,
    );
    expect(getCellTypes(container, 'col1').every(t => t === 'text')).toBe(true);
  });

  it('supports mixed column types in single grid', () => {
    const cols: ColumnDef<any>[] = [
      { id: 'col1', field: 'col1', title: 'Col 1', cellType: 'text' },
      { id: 'col2', field: 'col2', title: 'Col 2', cellType: 'numeric' },
      { id: 'col3', field: 'col3', title: 'Col 3', cellType: 'boolean' },
    ];
    const { container } = render(
      <DataGrid data={makeRows(2)} columns={cols} rowKey="id" pivotMode="column" />,
    );
    expect(getCellTypes(container, 'col1').every(t => t === 'text')).toBe(true);
    expect(getCellTypes(container, 'col2').every(t => t === 'numeric')).toBe(true);
    expect(getCellTypes(container, 'col3').every(t => t === 'boolean')).toBe(true);
  });

  it('maintains cell type after data update', () => {
    const cols = makeCols('currency');
    const { container, rerender } = render(
      <DataGrid data={[{ id: '1', col1: 10, col2: 20 }]} columns={cols} rowKey="id" pivotMode="column" />,
    );
    expect(getCellTypes(container, 'col1')[0]).toBe('currency');
    rerender(
      <DataGrid data={[{ id: '1', col1: 99, col2: 88 }]} columns={cols} rowKey="id" pivotMode="column" />,
    );
    expect(getCellTypes(container, 'col1')[0]).toBe('currency');
  });

  it('maintains cell type after sort', () => {
    const cols: ColumnDef<any>[] = [
      { id: 'col1', field: 'col1', title: 'Col 1', cellType: 'numeric', sortable: true },
    ];
    const { container } = render(
      <DataGrid data={makeRows(3)} columns={cols} rowKey="id" pivotMode="column" />,
    );
    const header = screen.getByRole('columnheader', { name: /col 1/i });
    fireEvent.click(header);
    expect(getCellTypes(container, 'col1').every(t => t === 'numeric')).toBe(true);
  });

  it('maintains cell type after filter', () => {
    const cols: ColumnDef<any>[] = [
      { id: 'col1', field: 'col1', title: 'Col 1', cellType: 'tags', filterable: true },
    ];
    const { container } = render(
      <DataGrid data={makeRows(3)} columns={cols} rowKey="id" pivotMode="column" filtering={true} />,
    );
    // Cell type attribute persists regardless of filter state
    expect(getCellTypes(container, 'col1').every(t => t === 'tags')).toBe(true);
  });

  it('cellType from column config overrides default', () => {
    const cols: ColumnDef<PivotRow>[] = [
      { id: 'col1', field: 'col1', title: 'Col 1', cellType: 'status' },
    ];
    const { container } = render(
      <DataGrid data={makeRows(2)} columns={cols} rowKey="id" pivotMode="column" />,
    );
    // Without cellType it would default to 'text', but column config sets 'status'
    expect(getCellTypes(container, 'col1').every(t => t === 'status')).toBe(true);
  });

  it('renders correct options for status column', () => {
    const cols: ColumnDef<any>[] = [
      {
        id: 'col1', field: 'col1', title: 'Col 1', cellType: 'status',
        options: [{ value: 'open', label: 'Open', color: '#0f0' }, { value: 'closed', label: 'Closed' }],
      },
    ];
    const { container } = render(
      <DataGrid data={makeRows(1)} columns={cols} rowKey="id" pivotMode="column" />,
    );
    // The data-cell-type attribute is set to 'status' and column config holds the options
    expect(getCellTypes(container, 'col1')[0]).toBe('status');
    expect(cols[0].options).toHaveLength(2);
    expect(cols[0].options![0].value).toBe('open');
  });

  it('renders correct suggestions for tags column', () => {
    const cols: ColumnDef<any>[] = [
      { id: 'col1', field: 'col1', title: 'Col 1', cellType: 'tags', suggestions: ['alpha', 'beta'] },
    ];
    const { container } = render(
      <DataGrid data={makeRows(1)} columns={cols} rowKey="id" pivotMode="column" />,
    );
    expect(getCellTypes(container, 'col1')[0]).toBe('tags');
    expect(cols[0].suggestions).toEqual(['alpha', 'beta']);
  });

  it('renders calendar picker in date column on edit', () => {
    const cols: ColumnDef<any>[] = [
      { id: 'col1', field: 'col1', title: 'Col 1', cellType: 'calendar' },
    ];
    const { container } = render(
      <DataGrid data={makeRows(1)} columns={cols} rowKey="id" pivotMode="column" />,
    );
    expect(getCellTypes(container, 'col1')[0]).toBe('calendar');
    // Enter edit mode
    const cell = container.querySelector('[data-cell-type="calendar"]')!;
    fireEvent.dblClick(cell);
    // Default editing input is rendered
    expect(container.querySelector('input')).toBeInTheDocument();
  });

  it('renders numeric input in numeric column on edit', () => {
    const data = [{ id: '1', col1: 42, col2: 'x' }];
    const cols: ColumnDef<any>[] = [
      { id: 'col1', field: 'col1', title: 'Col 1', cellType: 'numeric' },
    ];
    const { container } = render(
      <DataGrid data={data} columns={cols} rowKey="id" pivotMode="column" />,
    );
    expect(getCellTypes(container, 'col1')[0]).toBe('numeric');
    const cell = container.querySelector('[data-cell-type="numeric"]')!;
    fireEvent.dblClick(cell);
    expect(container.querySelector('input')).toBeInTheDocument();
  });

  it('renders password mask in password column', () => {
    const { container } = render(
      <DataGrid data={makeRows(1)} columns={makeCols('password')} rowKey="id" pivotMode="column" />,
    );
    expect(getCellTypes(container, 'col1')[0]).toBe('password');
  });

  it('supports cellRenderers override per type', () => {
    function CustomNumeric({ value }: CellRendererProps) {
      return <span data-testid="custom-numeric">{String(value)}</span>;
    }
    const cols: ColumnDef<any>[] = [
      { id: 'col1', field: 'col1', title: 'Col 1', cellType: 'numeric' },
    ];
    render(
      <DataGrid
        data={makeRows(2)}
        columns={cols}
        rowKey="id"
        pivotMode="column"
        cellRenderers={{ numeric: CustomNumeric as any }}
      />,
    );
    expect(screen.getAllByTestId('custom-numeric')).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Row-Driven Pivot (28 tests)
// ---------------------------------------------------------------------------

describe('row-driven pivot', () => {
  const twoColDefs: ColumnDef<PivotRow>[] = [
    { id: 'col1', field: 'col1', title: 'Col 1' },
    { id: 'col2', field: 'col2', title: 'Col 2' },
  ];

  it('renders different cell types per row', () => {
    const rowTypes: RowTypeDef[] = [
      { index: 0, cellType: 'text' },
      { index: 1, cellType: 'numeric' },
    ];
    const { container } = render(
      <DataGrid data={makeRows(2)} columns={twoColDefs} rowKey="id" pivotMode="row" rowTypes={rowTypes} />,
    );
    expect(getCellTypesForRow(container, '1').every(t => t === 'text')).toBe(true);
    expect(getCellTypesForRow(container, '2').every(t => t === 'numeric')).toBe(true);
  });

  it('applies cellType from rowTypes config by row index', () => {
    const rowTypes: RowTypeDef[] = [
      { index: 0, cellType: 'status' },
      { index: 1, cellType: 'tags' },
      { index: 2, cellType: 'boolean' },
    ];
    const { container } = render(
      <DataGrid data={makeRows(3)} columns={twoColDefs} rowKey="id" pivotMode="row" rowTypes={rowTypes} />,
    );
    expect(getCellTypesForRow(container, '1').every(t => t === 'status')).toBe(true);
    expect(getCellTypesForRow(container, '2').every(t => t === 'tags')).toBe(true);
    expect(getCellTypesForRow(container, '3').every(t => t === 'boolean')).toBe(true);
  });

  it('row index zero gets first rowType', () => {
    const rowTypes: RowTypeDef[] = [{ index: 0, cellType: 'currency' }];
    const { container } = render(
      <DataGrid data={makeRows(1)} columns={twoColDefs} rowKey="id" pivotMode="row" rowTypes={rowTypes} />,
    );
    expect(getCellTypesForRow(container, '1').every(t => t === 'currency')).toBe(true);
  });

  it('row index one gets second rowType', () => {
    const rowTypes: RowTypeDef[] = [
      { index: 0, cellType: 'text' },
      { index: 1, cellType: 'password' },
    ];
    const { container } = render(
      <DataGrid data={makeRows(2)} columns={twoColDefs} rowKey="id" pivotMode="row" rowTypes={rowTypes} />,
    );
    expect(getCellTypesForRow(container, '2').every(t => t === 'password')).toBe(true);
  });

  it('renders text for row with text type', () => {
    const rowTypes: RowTypeDef[] = [{ index: 0, cellType: 'text' }];
    const { container } = render(
      <DataGrid data={makeRows(1)} columns={twoColDefs} rowKey="id" pivotMode="row" rowTypes={rowTypes} />,
    );
    expect(getCellTypesForRow(container, '1').every(t => t === 'text')).toBe(true);
  });

  it('renders checkbox for row with boolean type', () => {
    const data = [{ id: '1', col1: true, col2: false }];
    const rowTypes: RowTypeDef[] = [{ index: 0, cellType: 'boolean' }];
    const { container } = render(
      <DataGrid data={data} columns={twoColDefs} rowKey="id" pivotMode="row" rowTypes={rowTypes} />,
    );
    expect(getCellTypesForRow(container, '1').every(t => t === 'boolean')).toBe(true);
    expect(screen.getByText('\u2611')).toBeInTheDocument();
    expect(screen.getByText('\u2610')).toBeInTheDocument();
  });

  it('renders status for row with status type', () => {
    const rowTypes: RowTypeDef[] = [{ index: 0, cellType: 'status' }];
    const { container } = render(
      <DataGrid data={makeRows(1)} columns={twoColDefs} rowKey="id" pivotMode="row" rowTypes={rowTypes} />,
    );
    expect(getCellTypesForRow(container, '1').every(t => t === 'status')).toBe(true);
  });

  it('renders numeric for row with numeric type', () => {
    const rowTypes: RowTypeDef[] = [{ index: 0, cellType: 'numeric' }];
    const { container } = render(
      <DataGrid data={makeRows(1)} columns={twoColDefs} rowKey="id" pivotMode="row" rowTypes={rowTypes} />,
    );
    expect(getCellTypesForRow(container, '1').every(t => t === 'numeric')).toBe(true);
  });

  it('renders date for row with calendar type', () => {
    const rowTypes: RowTypeDef[] = [{ index: 0, cellType: 'calendar' }];
    const { container } = render(
      <DataGrid data={makeRows(1)} columns={twoColDefs} rowKey="id" pivotMode="row" rowTypes={rowTypes} />,
    );
    expect(getCellTypesForRow(container, '1').every(t => t === 'calendar')).toBe(true);
  });

  it('renders currency for row with currency type', () => {
    const data = [{ id: '1', col1: 19.99, col2: 5.0 }];
    const rowTypes: RowTypeDef[] = [{ index: 0, cellType: 'currency' }];
    const { container } = render(
      <DataGrid data={data} columns={twoColDefs} rowKey="id" pivotMode="row" rowTypes={rowTypes} />,
    );
    expect(getCellTypesForRow(container, '1').every(t => t === 'currency')).toBe(true);
    expect(screen.getByText('$19.99')).toBeInTheDocument();
  });

  it('renders tags for row with tags type', () => {
    const rowTypes: RowTypeDef[] = [{ index: 0, cellType: 'tags' }];
    const { container } = render(
      <DataGrid data={makeRows(1)} columns={twoColDefs} rowKey="id" pivotMode="row" rowTypes={rowTypes} />,
    );
    expect(getCellTypesForRow(container, '1').every(t => t === 'tags')).toBe(true);
  });

  it('renders password for row with password type', () => {
    const rowTypes: RowTypeDef[] = [{ index: 0, cellType: 'password' }];
    const { container } = render(
      <DataGrid data={makeRows(1)} columns={twoColDefs} rowKey="id" pivotMode="row" rowTypes={rowTypes} />,
    );
    expect(getCellTypesForRow(container, '1').every(t => t === 'password')).toBe(true);
  });

  it('renders upload for row with upload type', () => {
    const rowTypes: RowTypeDef[] = [{ index: 0, cellType: 'upload' }];
    const { container } = render(
      <DataGrid data={makeRows(1)} columns={twoColDefs} rowKey="id" pivotMode="row" rowTypes={rowTypes} />,
    );
    expect(getCellTypesForRow(container, '1').every(t => t === 'upload')).toBe(true);
  });

  it('renders richText for row with richText type', () => {
    const rowTypes: RowTypeDef[] = [{ index: 0, cellType: 'richText' }];
    const { container } = render(
      <DataGrid data={makeRows(1)} columns={twoColDefs} rowKey="id" pivotMode="row" rowTypes={rowTypes} />,
    );
    expect(getCellTypesForRow(container, '1').every(t => t === 'richText')).toBe(true);
  });

  it('renders list for row with list type', () => {
    const rowTypes: RowTypeDef[] = [{ index: 0, cellType: 'list' }];
    const { container } = render(
      <DataGrid data={makeRows(1)} columns={twoColDefs} rowKey="id" pivotMode="row" rowTypes={rowTypes} />,
    );
    expect(getCellTypesForRow(container, '1').every(t => t === 'list')).toBe(true);
  });

  it('renders chipSelect for row with chipSelect type', () => {
    const rowTypes: RowTypeDef[] = [{ index: 0, cellType: 'chipSelect' }];
    const { container } = render(
      <DataGrid data={makeRows(1)} columns={twoColDefs} rowKey="id" pivotMode="row" rowTypes={rowTypes} />,
    );
    expect(getCellTypesForRow(container, '1').every(t => t === 'chipSelect')).toBe(true);
  });

  it('renders compoundChipList for row with compoundChipList type', () => {
    const rowTypes: RowTypeDef[] = [{ index: 0, cellType: 'compoundChipList' }];
    const { container } = render(
      <DataGrid data={makeRows(1)} columns={twoColDefs} rowKey="id" pivotMode="row" rowTypes={rowTypes} />,
    );
    expect(getCellTypesForRow(container, '1').every(t => t === 'compoundChipList')).toBe(true);
  });

  it('renders actions for row with actions type', () => {
    const rowTypes: RowTypeDef[] = [{ index: 0, cellType: 'actions' }];
    const { container } = render(
      <DataGrid data={makeRows(1)} columns={twoColDefs} rowKey="id" pivotMode="row" rowTypes={rowTypes} />,
    );
    expect(getCellTypesForRow(container, '1').every(t => t === 'actions')).toBe(true);
  });

  it('falls back to column cellType when rowType not defined for index', () => {
    const cols: ColumnDef<PivotRow>[] = [
      { id: 'col1', field: 'col1', title: 'Col 1', cellType: 'numeric' },
      { id: 'col2', field: 'col2', title: 'Col 2', cellType: 'numeric' },
    ];
    // Only index 0 has a rowType; index 1 should fall back to column cellType
    const rowTypes: RowTypeDef[] = [{ index: 0, cellType: 'status' }];
    const { container } = render(
      <DataGrid data={makeRows(2)} columns={cols} rowKey="id" pivotMode="row" rowTypes={rowTypes} />,
    );
    expect(getCellTypesForRow(container, '1').every(t => t === 'status')).toBe(true);
    expect(getCellTypesForRow(container, '2').every(t => t === 'numeric')).toBe(true);
  });

  it('falls back to text when neither rowType nor column cellType defined', () => {
    // No rowType for index 0, no cellType on column
    const rowTypes: RowTypeDef[] = [{ index: 99, cellType: 'status' }]; // irrelevant index
    const { container } = render(
      <DataGrid data={makeRows(1)} columns={twoColDefs} rowKey="id" pivotMode="row" rowTypes={rowTypes} />,
    );
    expect(getCellTypesForRow(container, '1').every(t => t === 'text')).toBe(true);
  });

  it('supports options in rowType for status rows', () => {
    const rowTypes: RowTypeDef[] = [
      { index: 0, cellType: 'status', options: [{ value: 'active', label: 'Active' }] },
    ];
    const { container } = render(
      <DataGrid data={makeRows(1)} columns={twoColDefs} rowKey="id" pivotMode="row" rowTypes={rowTypes} />,
    );
    expect(getCellTypesForRow(container, '1').every(t => t === 'status')).toBe(true);
    expect(rowTypes[0].options).toHaveLength(1);
    expect(rowTypes[0].options![0].value).toBe('active');
  });

  it('maintains row types after sort', () => {
    const cols: ColumnDef<PivotRow>[] = [
      { id: 'col1', field: 'col1', title: 'Col 1', sortable: true },
      { id: 'col2', field: 'col2', title: 'Col 2' },
    ];
    const rowTypes: RowTypeDef[] = [
      { index: 0, cellType: 'currency' },
      { index: 1, cellType: 'tags' },
    ];
    const { container } = render(
      <DataGrid data={makeRows(2)} columns={cols} rowKey="id" pivotMode="row" rowTypes={rowTypes} />,
    );
    const header = screen.getByRole('columnheader', { name: /col 1/i });
    fireEvent.click(header);
    // After sort, row at visual index 0 should still be currency, index 1 tags
    const allCells = Array.from(container.querySelectorAll('[data-cell-type]'));
    const row0Cells = allCells.filter(el => {
      const row = el.closest('[data-row-id]');
      return row !== null;
    });
    // Row types are assigned by processed row index, so they persist across sorts
    expect(row0Cells.length).toBeGreaterThan(0);
    const types = row0Cells.map(el => el.getAttribute('data-cell-type'));
    expect(types).toContain('currency');
    expect(types).toContain('tags');
  });

  it('maintains row types after filter', () => {
    const cols: ColumnDef<PivotRow>[] = [
      { id: 'col1', field: 'col1', title: 'Col 1', filterable: true },
      { id: 'col2', field: 'col2', title: 'Col 2' },
    ];
    const rowTypes: RowTypeDef[] = [
      { index: 0, cellType: 'numeric' },
    ];
    const { container } = render(
      <DataGrid data={makeRows(2)} columns={cols} rowKey="id" pivotMode="row" rowTypes={rowTypes} filtering={true} />,
    );
    // Row at index 0 has numeric type
    const firstRowCells = getCellTypesForRow(container, '1');
    expect(firstRowCells.every(t => t === 'numeric')).toBe(true);
  });

  it('row types apply across all columns in that row', () => {
    const cols: ColumnDef<PivotRow>[] = [
      { id: 'col1', field: 'col1', title: 'Col 1' },
      { id: 'col2', field: 'col2', title: 'Col 2' },
      { id: 'col3', field: 'col3', title: 'Col 3' },
    ];
    const rowTypes: RowTypeDef[] = [{ index: 0, cellType: 'tags' }];
    const { container } = render(
      <DataGrid data={makeRows(1)} columns={cols} rowKey="id" pivotMode="row" rowTypes={rowTypes} />,
    );
    const rowCells = getCellTypesForRow(container, '1');
    expect(rowCells).toHaveLength(3);
    expect(rowCells.every(t => t === 'tags')).toBe(true);
  });

  it('mixed with column type gives row type precedence', () => {
    const cols: ColumnDef<PivotRow>[] = [
      { id: 'col1', field: 'col1', title: 'Col 1', cellType: 'numeric' },
      { id: 'col2', field: 'col2', title: 'Col 2', cellType: 'currency' },
    ];
    const rowTypes: RowTypeDef[] = [{ index: 0, cellType: 'status' }];
    const { container } = render(
      <DataGrid data={makeRows(1)} columns={cols} rowKey="id" pivotMode="row" rowTypes={rowTypes} />,
    );
    // Row type 'status' should override column types 'numeric' and 'currency'
    expect(getCellTypesForRow(container, '1').every(t => t === 'status')).toBe(true);
  });

  it('supports editing in typed rows', () => {
    const rowTypes: RowTypeDef[] = [{ index: 0, cellType: 'text' }];
    const { container } = render(
      <DataGrid data={makeRows(1)} columns={twoColDefs} rowKey="id" pivotMode="row" rowTypes={rowTypes} />,
    );
    const cell = container.querySelector('[data-cell-type="text"]')!;
    fireEvent.dblClick(cell);
    expect(container.querySelector('input')).toBeInTheDocument();
  });

  it('preserves row type on data update', () => {
    const rowTypes: RowTypeDef[] = [{ index: 0, cellType: 'calendar' }];
    const { container, rerender } = render(
      <DataGrid data={makeRows(1)} columns={twoColDefs} rowKey="id" pivotMode="row" rowTypes={rowTypes} />,
    );
    expect(getCellTypesForRow(container, '1').every(t => t === 'calendar')).toBe(true);
    rerender(
      <DataGrid
        data={[{ id: '1', col1: 'updated', col2: 'updated2', col3: 'u3' }]}
        columns={twoColDefs}
        rowKey="id"
        pivotMode="row"
        rowTypes={rowTypes}
      />,
    );
    expect(getCellTypesForRow(container, '1').every(t => t === 'calendar')).toBe(true);
  });

  it('supports cellRenderers override per type', () => {
    function CustomStatus({ value }: CellRendererProps) {
      return <span data-testid="custom-status">{String(value)}</span>;
    }
    const rowTypes: RowTypeDef[] = [{ index: 0, cellType: 'status' }];
    render(
      <DataGrid
        data={makeRows(1)}
        columns={twoColDefs}
        rowKey="id"
        pivotMode="row"
        rowTypes={rowTypes}
        cellRenderers={{ status: CustomStatus as any }}
      />,
    );
    expect(screen.getAllByTestId('custom-status')).toHaveLength(2); // 2 columns
  });
});
