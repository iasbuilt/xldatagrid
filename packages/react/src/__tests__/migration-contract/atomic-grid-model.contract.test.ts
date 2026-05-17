/**
 * Contract: `createGridModel` bundle shape and lifecycle.
 *
 * This spec pins the OBSERVABLE behavior of the bundle returned by
 * `createGridModel`. It must pass on the current Jotai-backed
 * implementation AND on the post-migration causl-backed implementation.
 *
 * What is intentionally NOT asserted:
 *   - the runtime type of `bundle.store` / `bundle.atoms` (those names change
 *     to `bundle.graph` / `bundle.nodes` after migration);
 *   - any imports from `jotai`.
 *
 * What IS asserted:
 *   - `bundle.model` satisfies the `GridModel` interface from core;
 *   - `getState()` returns a fully-populated `GridModelState` after construction;
 *   - mutations through `model.*` are observable via `model.subscribe`;
 *   - `model.destroy()` removes all listeners and is idempotent under repeat.
 */
import { describe, it, expect } from 'vitest';
import { createGridModel } from '@iasbuilt/datagrid-core';
import type { GridConfig } from '@iasbuilt/datagrid-core';

type Row = { id: string; name: string; age: number };

function makeConfig(): GridConfig<Row> {
  return {
    columns: [
      { id: 'name', field: 'name', title: 'Name', width: 160 },
      { id: 'age', field: 'age', title: 'Age', width: 80 },
    ],
    data: [
      { id: '1', name: 'Alice', age: 30 },
      { id: '2', name: 'Bob', age: 25 },
    ],
    rowKey: 'id',
  };
}

describe('createGridModel — bundle contract', () => {
  it('returns a bundle whose model satisfies GridModel', () => {
    const bundle = createGridModel(makeConfig());
    expect(bundle).toBeDefined();
    expect(typeof bundle.getState).toBe('function');
    expect(typeof bundle.getProcessedData).toBe('function');
    expect(typeof bundle.getRowIds).toBe('function');
    expect(typeof bundle.getVisibleColumns).toBe('function');
    expect(typeof bundle.subscribe).toBe('function');
    expect(typeof bundle.destroy).toBe('function');
  });

  it('exposes the full mutation surface required by consumers', () => {
    const model = createGridModel(makeConfig());
    const required = [
      'setCellValue',
      'beginEdit',
      'commitEdit',
      'cancelEdit',
      'insertRow',
      'deleteRows',
      'moveRow',
      'toggleRowSelect',
      'sort',
      'toggleColumnSort',
      'filter',
      'select',
      'selectRowByKey',
      'selectColumnByField',
      'extendTo',
      'extendRowSelection',
      'selectAllCells',
      'clearSelectionState',
      'setColumnWidth',
      'reorderColumnByField',
      'toggleColumnVisible',
      'freezeColumnByField',
      'undo',
      'redo',
      'toggleSubGridExpansion',
      'registerExtension',
      'unregisterExtension',
      'dispatch',
    ] as const;
    for (const m of required) {
      expect(typeof (model as Record<string, unknown>)[m]).toBe('function');
    }
  });

  it('initial state is fully populated from the supplied config', () => {
    const model = createGridModel(makeConfig());
    const s = model.getState();
    expect(s.data).toHaveLength(2);
    expect(s.data[0]?.name).toBe('Alice');
    expect(s.columns.order).toEqual(['name', 'age']);
    expect(s.sort).toEqual([]);
    expect(s.filter).toBeNull();
    expect(s.selection.range).toBeNull();
    expect(s.editing.cell).toBeNull();
    expect(s.undoRedo.undoStack).toEqual([]);
    expect(s.undoRedo.redoStack).toEqual([]);
    expect(s.expandedRows.size).toBe(0);
    expect(s.expandedSubGrids.size).toBe(0);
    expect(s.page).toBe(0);
  });

  it('derived selectors reflect base data without manual recomputation', () => {
    const model = createGridModel(makeConfig());
    expect(model.getRowIds()).toEqual(['1', '2']);
    expect(model.getVisibleColumns().map((c) => c.field)).toEqual(['name', 'age']);
    expect(model.getProcessedData()).toHaveLength(2);
  });

  it('subscribe is called on every mutation; unsubscribe stops notifications', () => {
    const model = createGridModel(makeConfig());
    let calls = 0;
    const unsub = model.subscribe(() => {
      calls += 1;
    });

    model.select({ rowId: '1', field: 'name' });
    model.sort([{ field: 'age', dir: 'asc' }]);
    const callsBeforeUnsub = calls;
    expect(callsBeforeUnsub).toBeGreaterThanOrEqual(2);

    unsub();
    model.clearSelectionState();
    expect(calls).toBe(callsBeforeUnsub);
  });

  it('destroy() removes listeners and is safe to await twice', async () => {
    const model = createGridModel(makeConfig());
    let calls = 0;
    model.subscribe(() => {
      calls += 1;
    });

    await model.destroy();
    model.select({ rowId: '1', field: 'name' });
    expect(calls).toBe(0);

    // Idempotency: a second destroy must not throw.
    await expect(model.destroy()).resolves.not.toThrow();
  });

  it('multiple bundles are isolated — no shared state', () => {
    const a = createGridModel(makeConfig());
    const b = createGridModel(makeConfig());

    a.select({ rowId: '1', field: 'name' });
    expect(a.getState().selection.range).not.toBeNull();
    expect(b.getState().selection.range).toBeNull();
  });
});
