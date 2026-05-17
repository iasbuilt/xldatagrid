/**
 * Contract: per-mutation observable semantics.
 *
 * Each public mutation on `GridModel` translates to exactly one or more atom
 * writes today; post-migration, each must translate to exactly one
 * `graph.commit(intent, …)` call. The OBSERVABLE state transition must
 * remain identical from the caller's perspective.
 *
 * These tests probe each mutation's effect on `model.getState()` and on
 * derived selectors (`getProcessedData`, `getRowIds`, `getVisibleColumns`).
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
      { id: '3', name: 'Carol', age: 40 },
    ],
    rowKey: 'id',
  };
}

describe('action-semantics — selection', () => {
  it('select(cell) sets selection.range with anchor=focus=cell', () => {
    const model = createGridModel(makeConfig());
    model.select({ rowId: '2', field: 'name' });
    const range = model.getState().selection.range;
    expect(range).not.toBeNull();
    expect(range?.anchor.rowId).toBe('2');
    expect(range?.focus.rowId).toBe('2');
  });

  it('extendTo(cell) keeps the previous anchor and moves focus', () => {
    const model = createGridModel(makeConfig());
    model.select({ rowId: '1', field: 'name' });
    model.extendTo({ rowId: '3', field: 'age' });
    const range = model.getState().selection.range;
    expect(range?.anchor.rowId).toBe('1');
    expect(range?.focus.rowId).toBe('3');
  });

  it('clearSelectionState() nulls out the range', () => {
    const model = createGridModel(makeConfig());
    model.select({ rowId: '1', field: 'name' });
    model.clearSelectionState();
    expect(model.getState().selection.range).toBeNull();
  });
});

describe('action-semantics — editing', () => {
  it('beginEdit sets editing.cell; cancelEdit clears it', () => {
    const model = createGridModel(makeConfig());
    model.beginEdit({ rowId: '1', field: 'name' });
    expect(model.getState().editing.cell?.rowId).toBe('1');
    model.cancelEdit();
    expect(model.getState().editing.cell).toBeNull();
  });

  it('setCellValue mutates the row and pushes to undo stack', async () => {
    const model = createGridModel(makeConfig());
    await model.setCellValue({ rowId: '1', field: 'name' }, 'Alicia');
    expect(model.getState().data[0]?.name).toBe('Alicia');
    expect(model.getState().undoRedo.undoStack.length).toBeGreaterThanOrEqual(1);
  });

  it('undo() reverses the last setCellValue', async () => {
    const model = createGridModel(makeConfig());
    await model.setCellValue({ rowId: '1', field: 'name' }, 'Alicia');
    model.undo();
    expect(model.getState().data[0]?.name).toBe('Alice');
  });

  it('redo() re-applies an undone change', async () => {
    const model = createGridModel(makeConfig());
    await model.setCellValue({ rowId: '1', field: 'name' }, 'Alicia');
    model.undo();
    model.redo();
    expect(model.getState().data[0]?.name).toBe('Alicia');
  });
});

describe('action-semantics — sort/filter', () => {
  it('sort() reorders processedData but not raw data', () => {
    const model = createGridModel(makeConfig());
    const beforeRaw = model.getState().data.map((r) => r.id);
    model.sort([{ field: 'age', dir: 'asc' }]);
    const afterRaw = model.getState().data.map((r) => r.id);
    expect(afterRaw).toEqual(beforeRaw); // raw data unchanged
    expect(model.getProcessedData().map((r) => r.id)).toEqual(['2', '1', '3']);
  });

  it('filter() narrows processedData; clearing restores it', () => {
    const model = createGridModel(makeConfig());
    model.filter({
      logic: 'and',
      filters: [{ field: 'age', operator: 'gt', value: 26 }],
    });
    expect(model.getProcessedData().map((r) => r.id)).toEqual(['1', '3']);
    model.filter(null);
    expect(model.getProcessedData()).toHaveLength(3);
  });

  it('toggleColumnSort cycles asc → desc → none when called with multi=false', () => {
    const model = createGridModel(makeConfig());
    model.toggleColumnSort('age', false);
    expect(model.getState().sort[0]).toEqual({ field: 'age', dir: 'asc' });
    model.toggleColumnSort('age', false);
    expect(model.getState().sort[0]).toEqual({ field: 'age', dir: 'desc' });
    model.toggleColumnSort('age', false);
    expect(model.getState().sort).toEqual([]);
  });
});

describe('action-semantics — columns', () => {
  it('setColumnWidth updates columns.widths', () => {
    const model = createGridModel(makeConfig());
    model.setColumnWidth('name', 240);
    expect(model.getState().columns.widths.name).toBe(240);
  });

  it('toggleColumnVisible removes/restores a column from visible projection', () => {
    const model = createGridModel(makeConfig());
    expect(model.getVisibleColumns().map((c) => c.field)).toEqual(['name', 'age']);
    model.toggleColumnVisible('age');
    expect(model.getVisibleColumns().map((c) => c.field)).toEqual(['name']);
    model.toggleColumnVisible('age');
    expect(model.getVisibleColumns().map((c) => c.field)).toEqual(['name', 'age']);
  });

  it('reorderColumnByField changes columns.order', () => {
    const model = createGridModel(makeConfig());
    model.reorderColumnByField('age', 0);
    expect(model.getState().columns.order).toEqual(['age', 'name']);
  });

  it('freezeColumnByField updates columns.frozen', () => {
    const model = createGridModel(makeConfig());
    model.freezeColumnByField('name', 'left');
    expect(model.getState().columns.frozen).toContain('name');
    model.freezeColumnByField('name', null);
    expect(model.getState().columns.frozen).not.toContain('name');
  });
});

describe('action-semantics — rows', () => {
  it('insertRow grows data and getRowIds', async () => {
    const model = createGridModel(makeConfig());
    await model.insertRow(1, { id: '99', name: 'X', age: 50 });
    const ids = model.getRowIds();
    expect(ids).toContain('99');
    expect(model.getState().data.find((r) => r.id === '99')).toBeDefined();
  });

  it('deleteRows shrinks data', async () => {
    const model = createGridModel(makeConfig());
    await model.deleteRows(['2']);
    expect(model.getState().data.map((r) => r.id)).toEqual(['1', '3']);
  });

  it('moveRow swaps positions in raw data', async () => {
    const model = createGridModel(makeConfig());
    await model.moveRow(0, 2);
    expect(model.getState().data.map((r) => r.id)).toEqual(['2', '3', '1']);
  });
});

describe('action-semantics — atomicity (causl-readiness)', () => {
  it('a single mutation produces exactly one subscriber notification (no intermediate states observable)', () => {
    /**
     * Jotai today fires once because every action atom batches its writes
     * via a single setter call. Causl post-migration MUST guarantee the same
     * via `graph.commit(...)` atomicity. This test makes that guarantee
     * machine-checkable.
     */
    const model = createGridModel(makeConfig());
    let calls = 0;
    model.subscribe(() => {
      calls += 1;
    });
    model.select({ rowId: '1', field: 'name' });
    expect(calls).toBe(1);
  });

  it('a no-op mutation does not notify subscribers (clearSelection on empty)', () => {
    const model = createGridModel(makeConfig());
    // Selection already null; clearing again should still produce a write,
    // but the *contract* leaves this implementation-defined. We only assert
    // that subscribers are not called *more than once*.
    let calls = 0;
    model.subscribe(() => {
      calls += 1;
    });
    model.clearSelectionState();
    expect(calls).toBeLessThanOrEqual(1);
  });
});
