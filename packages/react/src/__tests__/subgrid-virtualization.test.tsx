/**
 * WS-G RED: Subgrid virtualisation preservation.
 *
 * When ONE subgrid row is expanded, the outer virtualisation loop must NOT
 * render all rows outside the viewport. Only the window of rows that fit in
 * the viewport (plus overscan) and the inner subgrid rows should appear.
 *
 * Current behaviour (pre-fix): DataGridBody.tsx lines 709-713 — when
 * `hasExpandedSubGrids=true` the render falls back to
 *   `processedData.map((_, i) => i)`
 * which renders EVERY row regardless of the viewport. On a 500-row grid
 * expanding ONE subgrid causes all 500 rows to be mounted.
 *
 * This test FAILS against main because after expansion the row count jumps
 * to TOTAL_ROWS instead of staying in the virtualised window.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { DataGrid } from '../DataGrid';
import { cellRendererMap } from '../cells';
import { ColumnDef } from '@iasbuilt/datagrid-core';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type OrderItem = { itemId: string; product: string };
type BigRow = { id: string; name: string; orders?: OrderItem[] };

function makeBigData(count: number): BigRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: String(i),
    name: `Row ${i}`,
    // Only row 0 has orders so expansion is realistic
    orders: i === 0 ? [{ itemId: 'o1', product: 'Widget' }] : undefined,
  }));
}

const columns: ColumnDef<BigRow>[] = [
  { id: 'name', field: 'name', title: 'Name', width: 120 },
  {
    id: 'orders',
    field: 'orders',
    title: 'Orders',
    width: 120,
    cellType: 'subGrid',
    subGridColumns: [{ id: 'product', field: 'product', title: 'Product', width: 100 }],
    subGridRowKey: 'itemId',
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Subgrid virtualisation — preserves windowing when one subgrid expands', () => {
  it('renders far fewer than TOTAL_ROWS elements after one subgrid expands', () => {
    const TOTAL_ROWS = 500;
    const data = makeBigData(TOTAL_ROWS);

    const { container } = render(
      <DataGrid<BigRow>
        data={data}
        columns={columns}
        rowKey="id"
        rowHeight={32}
        cellRenderers={cellRendererMap}
        subGrid={{ maxDepth: 2 }}
      />,
    );

    // Row 0 is always in the viewport at scroll=0. Click its toggle.
    const firstToggle = container.querySelector('[data-testid="subgrid-toggle"]') as HTMLElement | null;
    expect(firstToggle).not.toBeNull();
    fireEvent.click(firstToggle!);

    // After expansion the expansion row should appear
    const expansionRows = container.querySelectorAll('[data-testid^="subgrid-expansion-"]');
    expect(expansionRows.length).toBeGreaterThanOrEqual(1);

    // Count rendered parent data rows
    const dataRows = container.querySelectorAll('[role="row"][data-row-header="true"]');
    const renderedRowCount = dataRows.length;

    // jsdom viewport defaults: width=800, height=600. With rowHeight=32:
    //   visibleCount = ceil(600/32) = 19 rows + 3 overscan each side = ~25 rows max
    // We allow up to 60 to be generous with overscan and header rows.
    // Pre-fix: ALL 500 rows are rendered — this fails the upper bound.
    // Post-fix: only the viewport window is rendered — this passes.
    const MAX_ACCEPTABLE = 60;
    expect(renderedRowCount).toBeLessThanOrEqual(MAX_ACCEPTABLE);
    expect(renderedRowCount).toBeGreaterThan(0);
  });

  it('expansion row for the toggled row appears in the DOM', () => {
    const data = makeBigData(500);
    const { container } = render(
      <DataGrid<BigRow>
        data={data}
        columns={columns}
        rowKey="id"
        rowHeight={32}
        cellRenderers={cellRendererMap}
        subGrid={{ maxDepth: 2 }}
      />,
    );

    const firstToggle = container.querySelector('[data-testid="subgrid-toggle"]') as HTMLElement | null;
    expect(firstToggle).not.toBeNull();
    fireEvent.click(firstToggle!);

    // The subgrid expansion row for row "0" should be in the DOM
    const expansionRow = container.querySelector('[data-testid="subgrid-expansion-0"]');
    expect(expansionRow).not.toBeNull();
  });
});
