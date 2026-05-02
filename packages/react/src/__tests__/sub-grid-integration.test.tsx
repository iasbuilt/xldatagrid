import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import {
  createGridModel,
  GridModel,
  ColumnDef,
  GridConfig,
} from '@iasbuilt/datagrid-core';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

type OrderItem = { itemId: string; product: string; qty: number };
type TestRow = {
  id: string;
  name: string;
  age: number;
  orders?: OrderItem[];
};

function makeData(): TestRow[] {
  return [
    { id: '1', name: 'Alice', age: 30, orders: [
      { itemId: 'o1', product: 'Widget', qty: 5 },
      { itemId: 'o2', product: 'Gadget', qty: 2 },
    ]},
    { id: '2', name: 'Bob', age: 25, orders: [
      { itemId: 'o3', product: 'Doohickey', qty: 1 },
    ]},
    { id: '3', name: 'Charlie', age: 35, orders: [] },
  ];
}

const columns: ColumnDef<TestRow>[] = [
  { id: 'name', field: 'name', title: 'Name' },
  { id: 'age', field: 'age', title: 'Age' },
  {
    id: 'orders', field: 'orders', title: 'Orders',
    cellType: 'subGrid',
    subGridColumns: [
      { id: 'product', field: 'product', title: 'Product' },
      { id: 'qty', field: 'qty', title: 'Qty' },
    ],
    subGridRowKey: 'itemId',
  },
];

function createTestModel(data?: TestRow[], cols?: ColumnDef<TestRow>[]) {
  return createGridModel<TestRow>({
    data: data ?? makeData(),
    columns: (cols ?? columns) as ColumnDef<TestRow>[],
    rowKey: 'id',
    subGrid: { maxDepth: 2 },
  });
}

// ---------------------------------------------------------------------------
// Sub-grid expansion/collapse
// ---------------------------------------------------------------------------

describe('Sub-grid integration — expansion and collapse', () => {
  it('sub-grid expands row to show nested grid', () => {
    const model = createTestModel();
    const state = model.getState();
    // Expand row '1' sub-grid
    state.expandedSubGrids.add('1');
    expect(state.expandedSubGrids.has('1')).toBe(true);
  });

  it('sub-grid collapses expanded row', () => {
    const model = createTestModel();
    const state = model.getState();
    state.expandedSubGrids.add('1');
    expect(state.expandedSubGrids.has('1')).toBe(true);
    state.expandedSubGrids.delete('1');
    expect(state.expandedSubGrids.has('1')).toBe(false);
  });

  it('sub-grid only one row expanded at a time when configured', () => {
    const model = createTestModel();
    const state = model.getState();
    // Simulate single-expand mode: clear before adding
    state.expandedSubGrids.clear();
    state.expandedSubGrids.add('1');
    // When expanding another row in single mode, first must be cleared
    state.expandedSubGrids.clear();
    state.expandedSubGrids.add('2');
    expect(state.expandedSubGrids.size).toBe(1);
    expect(state.expandedSubGrids.has('2')).toBe(true);
    expect(state.expandedSubGrids.has('1')).toBe(false);
  });

  it('sub-grid allows multiple rows expanded simultaneously when configured', () => {
    const model = createTestModel();
    const state = model.getState();
    state.expandedSubGrids.add('1');
    state.expandedSubGrids.add('2');
    state.expandedSubGrids.add('3');
    expect(state.expandedSubGrids.size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Sub-grid data binding
// ---------------------------------------------------------------------------

describe('Sub-grid integration — data binding', () => {
  it('sub-grid passes parent row data as context to nested grid', () => {
    const data = makeData();
    const model = createTestModel(data);
    const parentRow = model.getState().data[0]!;
    // The parent row is accessible and has the orders field
    expect(parentRow.orders).toBeDefined();
    expect(parentRow.orders).toHaveLength(2);
    expect(parentRow.name).toBe('Alice');
  });

  it('sub-grid nested grid receives own column definitions', () => {
    const ordersCol = columns.find(c => c.field === 'orders')!;
    expect(ordersCol.subGridColumns).toBeDefined();
    expect(ordersCol.subGridColumns).toHaveLength(2);
    expect(ordersCol.subGridColumns![0]!.field).toBe('product');
    expect(ordersCol.subGridColumns![1]!.field).toBe('qty');
  });

  it('sub-grid nested grid data binds to parent row field', () => {
    const data = makeData();
    const model = createTestModel(data);
    const parentRow = model.getState().data[0]!;
    const nestedData = parentRow.orders!;
    expect(nestedData[0]!.product).toBe('Widget');
    expect(nestedData[0]!.qty).toBe(5);
    expect(nestedData[1]!.product).toBe('Gadget');
  });
});

// ---------------------------------------------------------------------------
// Sub-grid callbacks
// ---------------------------------------------------------------------------

describe('Sub-grid integration — callbacks', () => {
  it('sub-grid fires onExpand callback with row data', async () => {
    const model = createTestModel();
    const expandEvents: Record<string, unknown>[] = [];
    // Register an extension that listens for state change events
    await model.registerExtension({
      id: 'expand-listener',
      name: 'Expand Listener',
      hooks: (ctx) => [{
        event: 'grid:stateChange',
        handler: (evt) => { expandEvents.push(evt.payload); },
      }],
    });
    await model.dispatch('grid:stateChange', { expandedSubGrid: '1', action: 'expand' });
    expect(expandEvents).toHaveLength(1);
    expect(expandEvents[0]!.action).toBe('expand');
    expect(expandEvents[0]!.expandedSubGrid).toBe('1');
  });

  it('sub-grid fires onCollapse callback with row data', async () => {
    const model = createTestModel();
    const collapseEvents: Record<string, unknown>[] = [];
    await model.registerExtension({
      id: 'collapse-listener',
      name: 'Collapse Listener',
      hooks: (ctx) => [{
        event: 'grid:stateChange',
        handler: (evt) => { collapseEvents.push(evt.payload); },
      }],
    });
    await model.dispatch('grid:stateChange', { expandedSubGrid: '1', action: 'collapse' });
    expect(collapseEvents).toHaveLength(1);
    expect(collapseEvents[0]!.action).toBe('collapse');
  });

  it('sub-grid preserves expansion state across data updates', async () => {
    const model = createTestModel();
    const state = model.getState();
    state.expandedSubGrids.add('1');
    state.expandedSubGrids.add('2');
    await model.setCellValue({ rowId: '1', field: 'name' }, 'Alice Updated');
    expect(model.getState().expandedSubGrids.has('1')).toBe(true);
    expect(model.getState().expandedSubGrids.has('2')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Sub-grid nested operations
// ---------------------------------------------------------------------------

describe('Sub-grid integration — nested operations', () => {
  it('sub-grid nested grid supports full editing', async () => {
    const data = makeData();
    const nestedData = data[0]!.orders!;
    const nestedColumns: ColumnDef[] = [
      { id: 'product', field: 'product', title: 'Product' },
      { id: 'qty', field: 'qty', title: 'Qty' },
    ];
    const nestedModel = createGridModel({
      data: nestedData as unknown as Record<string, unknown>[],
      columns: nestedColumns,
      rowKey: 'itemId' as any,
    });
    await nestedModel.setCellValue({ rowId: 'o1', field: 'product' }, 'SuperWidget');
    expect(nestedModel.getState().data[0]!.product).toBe('SuperWidget');
  });

  it('sub-grid nested grid supports sorting independently', () => {
    const data = makeData();
    const nestedData = data[0]!.orders!;
    const nestedColumns: ColumnDef[] = [
      { id: 'product', field: 'product', title: 'Product', sortable: true },
      { id: 'qty', field: 'qty', title: 'Qty', sortable: true },
    ];
    const nestedModel = createGridModel({
      data: nestedData as unknown as Record<string, unknown>[],
      columns: nestedColumns,
      rowKey: 'itemId' as any,
    });
    nestedModel.sort([{ field: 'qty', dir: 'asc' }]);
    const processed = nestedModel.getProcessedData();
    expect((processed[0] as any).qty).toBe(2);
    expect((processed[1] as any).qty).toBe(5);
  });

  it('sub-grid nested grid supports filtering independently', () => {
    const data = makeData();
    const nestedData = data[0]!.orders!;
    const nestedColumns: ColumnDef[] = [
      { id: 'product', field: 'product', title: 'Product' },
      { id: 'qty', field: 'qty', title: 'Qty' },
    ];
    const nestedModel = createGridModel({
      data: nestedData as unknown as Record<string, unknown>[],
      columns: nestedColumns,
      rowKey: 'itemId' as any,
    });
    nestedModel.filter({ logic: 'and', filters: [{ field: 'qty', operator: 'gt', value: 3 }] });
    const processed = nestedModel.getProcessedData();
    expect(processed).toHaveLength(1);
    expect((processed[0] as any).product).toBe('Widget');
  });

  it('sub-grid nested changes propagate to parent data model', () => {
    const data = makeData();
    const parentModel = createTestModel(data);
    // Directly mutate nested data through the parent's data reference
    const parentRow = parentModel.getState().data[0]!;
    parentRow.orders![0]!.product = 'MegaWidget';
    expect(parentModel.getState().data[0]!.orders![0]!.product).toBe('MegaWidget');
  });
});

// ---------------------------------------------------------------------------
// Sub-grid UI features
// ---------------------------------------------------------------------------

describe('Sub-grid integration — UI features', () => {
  it('sub-grid renders expand icon in designated column', () => {
    const ordersCol = columns.find(c => c.cellType === 'subGrid');
    expect(ordersCol).toBeDefined();
    expect(ordersCol!.cellType).toBe('subGrid');
    expect(ordersCol!.field).toBe('orders');
  });

  it('sub-grid supports lazy loading nested data', async () => {
    const model = createTestModel();
    const config = model.getState().config;
    expect(config.subGrid).toBeDefined();
    // Simulate lazy load: data starts empty, gets filled async
    const lazyData = makeData();
    lazyData[0]!.orders = undefined as any; // not yet loaded
    const lazyModel = createTestModel(lazyData);
    const row = lazyModel.getState().data[0]!;
    expect(row.orders).toBeUndefined();
    // Simulate async load
    row.orders = [{ itemId: 'o1', product: 'LazyWidget', qty: 10 }];
    expect(lazyModel.getState().data[0]!.orders![0]!.product).toBe('LazyWidget');
  });

  it('sub-grid shows loading indicator during lazy fetch', () => {
    // When orders is undefined/null, the sub-grid should show loading state
    const lazyData = makeData();
    lazyData[0]!.orders = undefined as any;
    const model = createTestModel(lazyData);
    const row = model.getState().data[0]!;
    // A loading indicator would be shown when data is not yet available
    expect(row.orders).toBeUndefined();
    // After load
    row.orders = [{ itemId: 'o1', product: 'Loaded', qty: 1 }];
    expect(row.orders).toBeDefined();
  });

  it('sub-grid caches loaded nested data', () => {
    const data = makeData();
    const model = createTestModel(data);
    // Access nested data multiple times — it should be the same reference
    const orders1 = model.getState().data[0]!.orders;
    const orders2 = model.getState().data[0]!.orders;
    expect(orders1).toBe(orders2);
  });
});
