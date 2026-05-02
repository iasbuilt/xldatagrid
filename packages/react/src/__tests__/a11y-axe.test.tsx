/**
 * axe-core accessibility scans for the DataGrid across five representative
 * configurations.
 *
 * These tests complement the targeted ARIA/focus tests in `cell-a11y.test.tsx`
 * by running the full axe-core ruleset over a rendered grid. They catch
 * regressions that are hard to spot with hand-written assertions: missing
 * landmarks, duplicate ids across the tree, empty buttons, incorrectly nested
 * roles, etc.
 *
 * Scope:
 *   1. Minimal DataGrid (5 rows, 3 cols, default renderers, no chrome).
 *   2. DataGrid with chrome columns (controls + row numbers).
 *   3. DataGrid with a row expanded into a sub-grid.
 *   4. DataGrid with filter menu open on a column.
 *   5. DataGrid with the ghost row pinned to the bottom.
 *
 * The `color-contrast` rule is disabled because jsdom cannot compute actual
 * computed colors (no layout engine); all other rules run with axe-core's
 * defaults. A violation in any configuration fails the test and the matcher
 * prints a full selector + help-URL report.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { toHaveNoViolations } from 'vitest-axe/matchers';
import type { ColumnDef } from '@iasbuilt/datagrid-core';

import { DataGrid } from '../DataGrid';
import { cellRendererMap } from '../cells';

expect.extend({ toHaveNoViolations });

// ---------------------------------------------------------------------------
// Fixtures & helpers
// ---------------------------------------------------------------------------

type Row = { id: string; name: string; age: number; email: string };

function makeRows(): Row[] {
  return [
    { id: '1', name: 'Alice', age: 30, email: 'alice@example.com' },
    { id: '2', name: 'Bob', age: 25, email: 'bob@example.com' },
    { id: '3', name: 'Charlie', age: 35, email: 'charlie@example.com' },
    { id: '4', name: 'Dana', age: 40, email: 'dana@example.com' },
    { id: '5', name: 'Eve', age: 28, email: 'eve@example.com' },
  ];
}

const plainColumns: ColumnDef<Row>[] = [
  { id: 'name', field: 'name', title: 'Name' },
  { id: 'age', field: 'age', title: 'Age', cellType: 'numeric' },
  { id: 'email', field: 'email', title: 'Email' },
];

/**
 * axe-core ruleset tuned for jsdom.  `color-contrast` is the only rule we
 * disable; every other default rule is in effect.  jsdom does not run a
 * layout engine, so the computed colours needed for contrast evaluation are
 * unreliable and produce false-positive violations regardless of token wiring.
 */
const axeOptions = {
  rules: {
    'color-contrast': { enabled: false },
  },
};

// ---------------------------------------------------------------------------
// Scans
// ---------------------------------------------------------------------------

describe('DataGrid axe-core a11y scans', () => {
  it('minimal grid (5 rows, 3 cols, default renderers, no chrome) has no violations', async () => {
    const { container } = render(
      <DataGrid data={makeRows()} columns={plainColumns} rowKey="id" />,
    );
    const results = await axe(container, axeOptions);
    expect(results).toHaveNoViolations();
  });

  it('grid with chrome columns (controls + row numbers) has no violations', async () => {
    const { container } = render(
      <DataGrid
        data={makeRows()}
        columns={plainColumns}
        rowKey="id"
        chrome={{
          controls: {
            actions: [
              { key: 'view', label: 'View' },
              { key: 'delete', label: 'Delete' },
            ],
          },
          rowNumbers: { enabled: true, width: 40 },
        }}
      />,
    );
    const results = await axe(container, axeOptions);
    expect(results).toHaveNoViolations();
  });

  it('grid with a sub-grid expanded has no violations', async () => {
    type Order = { itemId: string; product: string; qty: number };
    type Parent = { id: string; name: string; orders: Order[] };

    const orderColumns: ColumnDef<Order>[] = [
      { id: 'product', field: 'product', title: 'Product' },
      { id: 'qty', field: 'qty', title: 'Qty', cellType: 'numeric' },
    ];

    const parentColumns: ColumnDef<Parent>[] = [
      { id: 'name', field: 'name', title: 'Name' },
      {
        id: 'orders',
        field: 'orders',
        title: 'Orders',
        cellType: 'subGrid',
        subGridColumns: orderColumns as ColumnDef[],
        subGridRowKey: 'itemId',
      },
    ];

    const parentData: Parent[] = [
      {
        id: 'p1',
        name: 'Alice',
        orders: [
          { itemId: 'o1', product: 'Widget', qty: 2 },
          { itemId: 'o2', product: 'Gadget', qty: 5 },
        ],
      },
      {
        id: 'p2',
        name: 'Bob',
        orders: [{ itemId: 'o3', product: 'Doohickey', qty: 1 }],
      },
    ];

    const { container, getAllByTestId } = render(
      <DataGrid
        data={parentData}
        columns={parentColumns as any}
        rowKey="id"
        cellRenderers={cellRendererMap}
        subGrid={{ maxDepth: 2 }}
      />,
    );

    // Open the first sub-grid so the nested grid renders inside the scan.
    const toggles = getAllByTestId('subgrid-toggle');
    act(() => {
      fireEvent.click(toggles[0]!);
    });

    const results = await axe(container, axeOptions);
    expect(results).toHaveNoViolations();
  });

  it('grid with filter menu open on a column has no violations', async () => {
    const { container, getAllByTestId } = render(
      <DataGrid
        data={makeRows()}
        columns={plainColumns}
        rowKey="id"
        filtering={true}
        showFilterMenu
      />,
    );

    // Click the first filter icon to open the Excel-style dropdown.
    const icons = getAllByTestId('column-filter-icon');
    act(() => {
      fireEvent.click(icons[0]!);
    });

    // Scan the grid container first.
    const gridResults = await axe(container, axeOptions);
    expect(gridResults).toHaveNoViolations();

    // The filter menu is portaled to document.body outside of `container`.
    // Scan it separately so the region (landmark) rule does not trigger on
    // the surrounding (test-harness) page chrome that jsdom creates.
    const menu = document.querySelector(
      '[data-testid="column-filter-menu"]',
    ) as HTMLElement | null;
    expect(menu).not.toBeNull();
    const menuResults = await axe(menu!, axeOptions);
    expect(menuResults).toHaveNoViolations();
  });

  it('grid with ghost row pinned to the bottom has no violations', async () => {
    const { container } = render(
      <DataGrid
        data={makeRows()}
        columns={plainColumns}
        rowKey="id"
        ghostRow={true}
      />,
    );
    const results = await axe(container, axeOptions);
    expect(results).toHaveNoViolations();
  });

  it('row-level outline after rowheader click has no violations (guards against wrapper div under role="row")', async () => {
    const { container, getAllByTestId } = render(
      <DataGrid
        data={makeRows()}
        columns={plainColumns}
        rowKey="id"
        selectionMode="row"
        chrome={{ rowNumbers: { enabled: true, width: 40 } }}
      />,
    );

    // Click the rowheader for the first row to activate the row-level outline.
    const rowNumberCells = getAllByTestId('chrome-row-number');
    act(() => {
      fireEvent.click(rowNumberCells[0]!);
    });

    const results = await axe(container, axeOptions);
    expect(results).toHaveNoViolations();
  });
});
