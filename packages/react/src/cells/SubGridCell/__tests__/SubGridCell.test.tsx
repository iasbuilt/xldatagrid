import { vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { SubGridCell } from '../SubGridCell';
import { GridContext } from '../../../context';
import { createGridModel } from '@iasbuilt/datagrid-core';
import type { ColumnDef, CellValue } from '@iasbuilt/datagrid-core';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeColumn(overrides: Partial<ColumnDef> = {}): ColumnDef {
  return { id: 'col1', field: 'col1', title: 'Column 1', ...overrides };
}

function makeProps(overrides: {
  value?: CellValue;
  column?: Partial<ColumnDef>;
  rowIndex?: number;
  isEditing?: boolean;
  onCommit?: (v: CellValue) => void;
  onCancel?: () => void;
  row?: Record<string, unknown>;
}) {
  return {
    value: overrides.value ?? null,
    row: overrides.row ?? { id: 'r1' },
    column: makeColumn(overrides.column),
    rowIndex: overrides.rowIndex ?? 0,
    isEditing: overrides.isEditing ?? false,
    onCommit: overrides.onCommit ?? vi.fn(),
    onCancel: overrides.onCancel ?? vi.fn(),
  };
}

const subRows = [
  { id: 'sr1', name: 'Sub row 1' },
  { id: 'sr2', name: 'Sub row 2' },
];

const subColumns: ColumnDef[] = [{ id: 'name', field: 'name', title: 'Name' }];

function renderWithModel(value: CellValue, rowIndex = 0) {
  const model = createGridModel({
    data: [
      { id: 'r1', items: value },
      { id: 'r2', items: [] },
    ] as any,
    columns: [
      { id: 'items', field: 'items', title: 'Items', cellType: 'subGrid', subGridColumns: subColumns, subGridRowKey: 'id' },
    ],
    rowKey: 'id',
  });
  const store: any = {};
  const atoms: any = {};
  const props = makeProps({ value, column: { subGridColumns: subColumns }, rowIndex, row: { id: 'r1' } });
  const view = render(
    <GridContext.Provider value={{ model, store, atoms }}>
      <div data-row-id={model.getRowIds()[rowIndex]}>
        <SubGridCell {...props} />
      </div>
    </GridContext.Provider>,
  );
  return { view, model };
}

describe('SubGridCell (badge + icon + count toggle)', () => {
  it('renders a toggle button with the correct row count badge', () => {
    renderWithModel(subRows);
    expect(screen.getByTestId('subgrid-toggle')).toBeInTheDocument();
    expect(screen.getByTestId('subgrid-count').textContent).toBe('2');
  });

  it('shows 0 count when value is empty array', () => {
    renderWithModel([]);
    expect(screen.getByTestId('subgrid-count').textContent).toBe('0');
  });

  it('shows 0 count when value is null', () => {
    renderWithModel(null);
    expect(screen.getByTestId('subgrid-count').textContent).toBe('0');
  });

  it('is collapsed by default (aria-expanded false)', () => {
    renderWithModel(subRows);
    expect(screen.getByTestId('subgrid-toggle')).toHaveAttribute('aria-expanded', 'false');
  });

  it('flips aria-expanded on click and toggles the model flag', () => {
    const { model } = renderWithModel(subRows);
    const btn = screen.getByTestId('subgrid-toggle');
    expect(model.getState().expandedSubGrids.has('r1')).toBe(false);
    fireEvent.click(btn);
    expect(model.getState().expandedSubGrids.has('r1')).toBe(true);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows the "x" close affordance when expanded', () => {
    renderWithModel(subRows);
    const btn = screen.getByTestId('subgrid-toggle');
    fireEvent.click(btn);
    // '\u00D7' is '×'
    expect(btn.textContent).toContain('\u00D7');
    expect(btn.textContent).not.toContain('\u25B6');
  });

  it('collapses on second click', () => {
    const { model } = renderWithModel(subRows);
    const btn = screen.getByTestId('subgrid-toggle');
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    expect(model.getState().expandedSubGrids.has('r1')).toBe(false);
  });

  it('stops propagation so the surrounding cell click handler does not fire', () => {
    const cellClick = vi.fn();
    const model = createGridModel({
      data: [{ id: 'r1', items: subRows }] as any,
      columns: [{ id: 'items', field: 'items', title: 'Items', cellType: 'subGrid', subGridColumns: subColumns, subGridRowKey: 'id' }],
      rowKey: 'id',
    });
    render(
      <GridContext.Provider value={{ model, store: {} as any, atoms: {} as any }}>
        <div data-row-id="r1" onClick={cellClick}>
          <SubGridCell {...makeProps({ value: subRows, column: { subGridColumns: subColumns } })} />
        </div>
      </GridContext.Provider>,
    );
    fireEvent.click(screen.getByTestId('subgrid-toggle'));
    expect(cellClick).not.toHaveBeenCalled();
  });
});
