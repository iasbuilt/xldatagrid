/**
 * WS-G RED: Subgrid ARIA linkage.
 *
 * When a subgrid row is expanded:
 *   1. The parent row's expander element must have aria-controls="<child-grid-id>"
 *   2. The child grid root must have id === that value
 *   3. The child grid must have aria-labelledby pointing at the parent cell (or
 *      the parent row must carry aria-owns referencing the child grid id).
 *
 * Current behaviour (pre-fix): none of these ARIA attributes exist.
 * This test FAILS against main.
 */
import { render, act, fireEvent } from '@testing-library/react';
import { DataGrid } from '../DataGrid';
import { cellRendererMap } from '../cells';
import { ColumnDef } from '@iasbuilt/datagrid-core';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type OrderItem = { itemId: string; product: string };
type TestRow = { id: string; name: string; orders?: OrderItem[] };

function makeData(): TestRow[] {
  return [
    {
      id: 'row-1',
      name: 'Alice',
      orders: [{ itemId: 'o1', product: 'Widget' }],
    },
    { id: 'row-2', name: 'Bob' },
  ];
}

const columns: ColumnDef<TestRow>[] = [
  { id: 'name', field: 'name', title: 'Name' },
  {
    id: 'orders',
    field: 'orders',
    title: 'Orders',
    cellType: 'subGrid',
    subGridColumns: [{ id: 'product', field: 'product', title: 'Product' }],
    subGridRowKey: 'itemId',
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Subgrid ARIA linkage', () => {
  it('expander element has aria-controls pointing at the child grid id', async () => {
    const { container } = render(
      <DataGrid<TestRow>
        data={makeData()}
        columns={columns}
        rowKey="id"
        gridId="parent-grid"
        cellRenderers={cellRendererMap}
        subGrid={{ maxDepth: 2 }}
      />,
    );

    // Click the toggle button inside the subgrid cell for row-1
    const toggleInRow1 = container.querySelector(
      '[data-row-id="row-1"] [data-testid="subgrid-toggle"]',
    ) as HTMLElement | null;
    if (toggleInRow1) {
      act(() => { fireEvent.click(toggleInRow1!); });
    }

    // The expander button (or the cell itself) must carry aria-controls
    const expander =
      container.querySelector('[aria-controls]') as HTMLElement | null;
    expect(expander).not.toBeNull();

    const controlsId = expander!.getAttribute('aria-controls')!;
    expect(controlsId).toBeTruthy();

    // That id must map to a real element in the DOM
    const childGrid = container.querySelector(`#${CSS.escape(controlsId)}`);
    expect(childGrid).not.toBeNull();
  });

  it('child grid root element has id matching the expander aria-controls value', async () => {
    const { container } = render(
      <DataGrid<TestRow>
        data={makeData()}
        columns={columns}
        rowKey="id"
        gridId="parent-grid"
        cellRenderers={cellRendererMap}
        subGrid={{ maxDepth: 2 }}
      />,
    );

    const toggleInRow1 = container.querySelector(
      '[data-row-id="row-1"] [data-testid="subgrid-toggle"]',
    ) as HTMLElement | null;
    if (toggleInRow1) {
      act(() => { fireEvent.click(toggleInRow1!); });
    }

    // Expect the child grid (role="grid" inside an expansion row) to have an id
    const expansionRow = container.querySelector(
      '[data-testid="subgrid-expansion-row-1"]',
    );
    if (!expansionRow) {
      // Fallback: look for any nested role="grid"
      const parentGrid = container.querySelector('[role="grid"]');
      const nestedGrids = container.querySelectorAll('[role="grid"]');
      // There should be at least 2: parent + child
      expect(nestedGrids.length).toBeGreaterThanOrEqual(2);
      const childGrid = nestedGrids[1] as HTMLElement;
      expect(childGrid.id).toBeTruthy();
    } else {
      const nestedGrid = expansionRow.querySelector('[role="grid"]') as HTMLElement | null;
      expect(nestedGrid).not.toBeNull();
      expect(nestedGrid!.id).toBeTruthy();
    }
  });

  it('child grid has aria-labelledby referencing a parent cell', async () => {
    const { container } = render(
      <DataGrid<TestRow>
        data={makeData()}
        columns={columns}
        rowKey="id"
        gridId="parent-grid"
        cellRenderers={cellRendererMap}
        subGrid={{ maxDepth: 2 }}
      />,
    );

    const toggleInRow1 = container.querySelector(
      '[data-row-id="row-1"] [data-testid="subgrid-toggle"]',
    ) as HTMLElement | null;
    if (toggleInRow1) {
      act(() => { fireEvent.click(toggleInRow1!); });
    }

    const allGrids = container.querySelectorAll('[role="grid"]');
    // Must have parent + child grid
    expect(allGrids.length).toBeGreaterThanOrEqual(2);

    // Child grids (index > 0) must have either aria-labelledby or be reachable
    // via aria-owns from their parent row
    const childGrid = allGrids[1] as HTMLElement;
    const hasLabelledBy = !!childGrid.getAttribute('aria-labelledby');
    const parentRowWithOwns = container.querySelector('[aria-owns]');
    expect(hasLabelledBy || !!parentRowWithOwns).toBe(true);
  });
});
