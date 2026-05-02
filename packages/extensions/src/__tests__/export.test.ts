import { vi } from 'vitest';
import {
  createExportExtension,
  generateCsv,
  generateExcelData,
  generateExcelFile,
  generatePdfData,
  generatePdfFile,
  getExportColumns,
  getExportRows,
  formatCellForExcel,
  ExportConfig,
  ExportResult,
  PdfTableData,
} from '../export';
import type { ColumnDef, ExtensionContext, GridState } from '@iasbuilt/datagrid-core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeColumns(): ColumnDef[] {
  return [
    { id: 'name', field: 'name', title: 'Name' },
    { id: 'age', field: 'age', title: 'Age', cellType: 'numeric' },
    { id: 'salary', field: 'salary', title: 'Salary', cellType: 'currency', format: '$#,##0.00' },
    { id: 'joined', field: 'joined', title: 'Joined', cellType: 'calendar', format: 'yyyy-mm-dd' },
    { id: 'hidden', field: 'hidden', title: 'Hidden', visible: false },
  ];
}

function makeRows() {
  return [
    { name: 'Alice', age: 30, salary: 75000, joined: new Date('2020-01-15'), hidden: 'x' },
    { name: 'Bob', age: 25, salary: 65000, joined: new Date('2021-06-01'), hidden: 'y' },
    { name: 'Charlie', age: 35, salary: 85000, joined: new Date('2019-03-20'), hidden: 'z' },
  ];
}

function makeFakeState(overrides: Partial<GridState> = {}): GridState {
  return {
    data: makeRows(),
    columns: makeColumns() as any,
    sort: [],
    filter: null,
    selection: null,
    editingCell: null,
    page: 0,
    pageSize: 50,
    expandedRows: new Set(),
    expandedSubGrids: new Set(),
    columnOrder: ['name', 'age', 'salary', 'joined', 'hidden'],
    columnWidths: {},
    hiddenColumns: new Set<string>(),
    frozenColumns: [],
    groupState: null,
    undoStack: [],
    redoStack: [],
    ...overrides,
  };
}

function makeFakeContext(state: GridState): ExtensionContext {
  return {
    gridState: state,
    commands: {} as any,
    emit: vi.fn(),
    addHook: vi.fn(() => () => {}),
    subscribe: vi.fn(() => () => {}),
    getState: () => state,
  };
}

function initExtension(config: ExportConfig = {}, stateOverrides: Partial<GridState> = {}) {
  const ext = createExportExtension(config);
  const state = makeFakeState(stateOverrides);
  const ctx = makeFakeContext(state);
  ext.init!(ctx);
  return { ext, state, ctx };
}

// ---------------------------------------------------------------------------
// Excel tests
// ---------------------------------------------------------------------------

describe('export Excel', () => {
  it('generates xlsx file', () => {
    const { ext } = initExtension();
    const result = ext.api.exportToExcel();
    expect(result.filename).toBe('export.xlsx');
    expect(ArrayBuffer.isView(result.content)).toBe(true);
    expect((result.content as Uint8Array).length).toBeGreaterThan(0);
  });

  it('includes all visible columns', () => {
    const { ext } = initExtension();
    const result = ext.api.exportToExcel();
    // "hidden" column has visible: false so should be excluded
    expect(result.columns.map(c => c.field)).toEqual(['name', 'age', 'salary', 'joined']);
  });

  it('includes all rows', () => {
    const { ext } = initExtension();
    const result = ext.api.exportToExcel();
    expect(result.rows).toHaveLength(3);
  });

  it('excludes hidden columns', () => {
    const { ext } = initExtension({}, { hiddenColumns: new Set(['age']) });
    const result = ext.api.exportToExcel();
    expect(result.columns.map(c => c.field)).not.toContain('age');
    expect(result.columns.map(c => c.field)).not.toContain('hidden');
  });

  it('respects active filters', () => {
    const { ext } = initExtension({}, {
      filter: { logic: 'and', filters: [{ field: 'age', operator: 'gt', value: 28 }] },
    });
    const result = ext.api.exportToExcel();
    // Only Alice (30) and Charlie (35) pass age > 28
    expect(result.rows).toHaveLength(2);
    expect(result.rows.map((r: any) => r.name)).toEqual(['Alice', 'Charlie']);
  });

  it('preserves numeric formatting', () => {
    const cols = makeColumns();
    const salaryCol = cols.find(c => c.field === 'salary')!;
    const formatted = formatCellForExcel(75000, salaryCol);
    expect(formatted.value).toBe(75000);
    expect(formatted.format).toBe('$#,##0.00');
  });

  it('preserves date formatting', () => {
    const cols = makeColumns();
    const joinedCol = cols.find(c => c.field === 'joined')!;
    const d = new Date('2020-01-15');
    const formatted = formatCellForExcel(d, joinedCol);
    expect(formatted.value).toEqual(d);
    expect(formatted.format).toBe('yyyy-mm-dd');
  });

  it('includes column headers as first row', () => {
    const cols = getExportColumns(makeColumns(), new Set());
    const rows = makeRows();
    const data = generateExcelData(cols, rows);
    expect(data.headers).toEqual(['Name', 'Age', 'Salary', 'Joined']);
    expect(data.dataRows).toHaveLength(3);
  });

  it('fires onExport callback', () => {
    const onExport = vi.fn();
    const { ext } = initExtension({ onExport });
    ext.api.exportToExcel();
    expect(onExport).toHaveBeenCalledTimes(1);
    expect(onExport).toHaveBeenCalledWith('excel', expect.objectContaining({ format: 'excel' }));
  });
});

// ---------------------------------------------------------------------------
// PDF tests
// ---------------------------------------------------------------------------

describe('export PDF', () => {
  it('generates pdf file', () => {
    const { ext } = initExtension();
    const result = ext.api.exportToPDF();
    expect(result.filename).toBe('export.pdf');
    expect(ArrayBuffer.isView(result.content)).toBe(true);
    expect((result.content as Uint8Array).length).toBeGreaterThan(0);
  });

  it('renders grid as table in PDF', () => {
    const cols = getExportColumns(makeColumns(), new Set());
    const rows = makeRows();
    const data = generatePdfData(cols, rows);
    expect(data.headers).toEqual(['Name', 'Age', 'Salary', 'Joined']);
    expect(data.bodyRows).toHaveLength(3);
    expect(data.bodyRows[0]![0]).toBe('Alice');
  });

  it('respects page size configuration', () => {
    const { ext } = initExtension({ page: { size: 'A3' } });
    const result = ext.api.exportToPDF();
    expect(result.page?.size).toBe('A3');
  });

  it('respects landscape orientation', () => {
    const { ext } = initExtension({ page: { orientation: 'landscape' } });
    const result = ext.api.exportToPDF();
    expect(result.page?.orientation).toBe('landscape');
  });

  it('includes header and footer when configured', () => {
    const { ext } = initExtension({ headerFooter: { header: 'Report Title', footer: 'Page 1' } });
    const result = ext.api.exportToPDF();
    expect(result.headerFooter?.header).toBe('Report Title');
    expect(result.headerFooter?.footer).toBe('Page 1');
  });

  it('excludes hidden columns', () => {
    const { ext } = initExtension({}, { hiddenColumns: new Set(['salary']) });
    const result = ext.api.exportToPDF();
    expect(result.columns.map(c => c.field)).not.toContain('salary');
    expect(result.columns.map(c => c.field)).not.toContain('hidden');
  });

  it('respects active filters', () => {
    const { ext } = initExtension({}, {
      filter: { logic: 'and', filters: [{ field: 'name', operator: 'eq', value: 'Bob' }] },
    });
    const result = ext.api.exportToPDF();
    expect(result.rows).toHaveLength(1);
    expect((result.rows[0] as any).name).toBe('Bob');
  });

  it('fires onExport callback', () => {
    const onExport = vi.fn();
    const { ext } = initExtension({ onExport });
    ext.api.exportToPDF();
    expect(onExport).toHaveBeenCalledTimes(1);
    expect(onExport).toHaveBeenCalledWith('pdf', expect.objectContaining({ format: 'pdf' }));
  });
});

// ---------------------------------------------------------------------------
// CSV tests
// ---------------------------------------------------------------------------

describe('export CSV', () => {
  it('generates csv file', () => {
    const { ext } = initExtension();
    const result = ext.api.exportToCSV();
    expect(result.filename).toBe('export.csv');
    expect(typeof result.content).toBe('string');
    expect((result.content as string).length).toBeGreaterThan(0);
  });

  it('separates values with comma', () => {
    const cols: ColumnDef[] = [
      { id: 'a', field: 'a', title: 'A' },
      { id: 'b', field: 'b', title: 'B' },
    ];
    const rows = [{ a: '1', b: '2' }];
    const csv = generateCsv(cols, rows);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('A,B');
    expect(lines[1]).toBe('1,2');
  });

  it('wraps values containing commas in quotes', () => {
    const cols: ColumnDef[] = [{ id: 'a', field: 'a', title: 'A' }];
    const rows = [{ a: 'hello, world' }];
    const csv = generateCsv(cols, rows);
    const lines = csv.split('\n');
    expect(lines[1]).toBe('"hello, world"');
  });

  it('escapes quotes within values', () => {
    const cols: ColumnDef[] = [{ id: 'a', field: 'a', title: 'A' }];
    const rows = [{ a: 'say "hi"' }];
    const csv = generateCsv(cols, rows);
    const lines = csv.split('\n');
    expect(lines[1]).toBe('"say ""hi"""');
  });

  it('includes column headers as first line', () => {
    const { ext } = initExtension();
    const result = ext.api.exportToCSV();
    const firstLine = (result.content as string).split('\n')[0];
    expect(firstLine).toBe('Name,Age,Salary,Joined');
  });

  it('excludes hidden columns', () => {
    const { ext } = initExtension({}, { hiddenColumns: new Set(['age']) });
    const result = ext.api.exportToCSV();
    const firstLine = (result.content as string).split('\n')[0]!;
    expect(firstLine).not.toContain('Age');
    expect(firstLine).not.toContain('Hidden');
  });

  it('respects active filters', () => {
    const { ext } = initExtension({}, {
      filter: { logic: 'and', filters: [{ field: 'age', operator: 'lt', value: 30 }] },
    });
    const result = ext.api.exportToCSV();
    const lines = (result.content as string).split('\n');
    // Header + 1 data row (Bob, age 25)
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('Bob');
  });
});
