/**
 * Red-phase contracts for grid density mode (paired with cell overflow).
 *
 * Specification (Phase B will satisfy):
 *
 *   1. `DataGrid` accepts an optional `density?: 'compact' | 'comfortable'`
 *      prop. The default is `'compact'` when omitted.
 *   2. The grid root (`role="grid"`) exposes `data-density="<density>"` so
 *      CSS and Playwright can target the current mode.
 *   3. Row height reflects density — roughly 36 px at compact and 48 px at
 *      comfortable. The test asserts the attribute contract (stable) rather
 *      than pixel-exact CSS values (Phase B may tune the numbers).
 *   4. Multi-line overflow policies (`clamp-2`, `clamp-3`, `wrap`) keep their
 *      own CSS regardless of density; density only influences row height, not
 *      the policy's own rendering rules. This matters so a `clamp-2` column
 *      at compact density still CSS-clamps to two lines even though only one
 *      might fit in 36 px — the visual tail is handled by the clamp rule.
 */
import { render, screen } from '@testing-library/react';
import { DataGrid } from '../DataGrid';
import { ColumnDef } from '@iasbuilt/datagrid-core';

type Row = { id: string; description: string };

const rows: Row[] = [
  { id: '1', description: 'The quick brown fox jumps over the lazy dog.' },
  { id: '2', description: 'Another row of descriptive text.' },
];

function findCell(rowId: string, field: string): HTMLElement {
  const cell = screen
    .getAllByRole('gridcell')
    .find(
      (c) =>
        c.getAttribute('data-row-id') === rowId &&
        c.getAttribute('data-field') === field,
    );
  if (!cell) {
    throw new Error(`gridcell for row=${rowId} field=${field} not found`);
  }
  return cell;
}

describe('grid density — data-density on the grid root', () => {
  it('defaults to compact when the density prop is not provided', () => {
    const columns: ColumnDef<Row>[] = [
      { id: 'description', field: 'description', title: 'Description' },
    ];
    const { container } = render(
      <DataGrid data={rows} columns={columns} rowKey="id" />,
    );
    const grid = container.querySelector('[role="grid"]') as HTMLElement;
    expect(grid.getAttribute('data-density')).toBe('compact');
  });

  it('reflects density="comfortable" on the root when set explicitly', () => {
    const columns: ColumnDef<Row>[] = [
      { id: 'description', field: 'description', title: 'Description' },
    ];
    const { container } = render(
      <DataGrid
        data={rows}
        columns={columns}
        rowKey="id"
        // @ts-expect-error — Phase B will add `density` to DataGridProps
        density="comfortable"
      />,
    );
    const grid = container.querySelector('[role="grid"]') as HTMLElement;
    expect(grid.getAttribute('data-density')).toBe('comfortable');
  });

  it('reflects density="compact" on the root when set explicitly', () => {
    const columns: ColumnDef<Row>[] = [
      { id: 'description', field: 'description', title: 'Description' },
    ];
    const { container } = render(
      <DataGrid
        data={rows}
        columns={columns}
        rowKey="id"
        // @ts-expect-error — Phase B will add `density` to DataGridProps
        density="compact"
      />,
    );
    const grid = container.querySelector('[role="grid"]') as HTMLElement;
    expect(grid.getAttribute('data-density')).toBe('compact');
  });
});

describe('grid density — interaction with multi-line policies', () => {
  it('keeps the clamp-2 data-overflow-policy on cells at compact density', () => {
    const columns: ColumnDef<Row>[] = [
      {
        id: 'description',
        field: 'description',
        title: 'Description',
        // @ts-expect-error — Phase B will add `overflow`
        overflow: 'clamp-2',
      },
    ];
    const { container } = render(
      <DataGrid
        data={rows}
        columns={columns}
        rowKey="id"
        // @ts-expect-error — Phase B will add `density`
        density="compact"
      />,
    );
    const grid = container.querySelector('[role="grid"]') as HTMLElement;
    expect(grid.getAttribute('data-density')).toBe('compact');
    // Density is a row-height concern only; the per-cell policy is
    // unchanged.
    const cell = findCell('1', 'description');
    expect(cell.getAttribute('data-overflow-policy')).toBe('clamp-2');
  });

  it('propagates density to rows (via data attribute or explicit row height)', () => {
    const columns: ColumnDef<Row>[] = [
      { id: 'description', field: 'description', title: 'Description' },
    ];
    const { container } = render(
      <DataGrid
        data={rows}
        columns={columns}
        rowKey="id"
        // @ts-expect-error — Phase B will add `density`
        density="comfortable"
      />,
    );
    const row = container.querySelector(
      '[role="row"][data-row-id="1"]',
    ) as HTMLElement | null;
    expect(row).not.toBeNull();
    // The density contract manifests on the row in one of two observable
    // ways: a propagated `data-density` attribute, or a larger inline
    // `style.height`. Either satisfies the test — Phase B may pick either.
    const densityAttr = row!.getAttribute('data-density');
    const heightPx = parseFloat(row!.style.height || '0');
    const densityOk = densityAttr === 'comfortable' || heightPx >= 44;
    expect(densityOk).toBe(true);
  });
});
