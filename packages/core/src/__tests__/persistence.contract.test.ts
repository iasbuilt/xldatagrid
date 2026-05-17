/**
 * Phase 2 contract: @causl/persistence integration for UI prefs.
 *
 * Column-state mutations (resize, reorder, toggle-visibility, freeze) round-
 * trip through a caller-supplied `StorageAdapter` so reloading the grid with
 * the same adapter restores prior UI preferences.
 *
 * Schema version is fixed at 1; older stored envelopes will fall back to
 * config-derived initial values unless a `migrate` is supplied later.
 */
import { describe, it, expect } from 'vitest';
import { memoryAdapter } from '@causl/persistence';
import { createGridModel } from '../grid-model';
import type { GridConfig } from '../types';

type Row = { id: string; name: string; age: number };

function makeConfig(overrides: Partial<GridConfig<Row>> = {}): GridConfig<Row> {
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
    ...overrides,
  };
}

describe('createGridModel — persistence contract', () => {
  it('column width changes write through to the storage adapter', () => {
    const storage = memoryAdapter();
    const model = createGridModel({ ...makeConfig(), storage });
    model.setColumnWidth('name', 240);
    // The adapter holds an envelope under the default key.
    const stored = storage.get('xldatagrid:grid:columns');
    expect(stored).not.toBeNull();
    expect(stored).toContain('240');
  });

  it('a second grid sharing the same adapter rehydrates the prior column state', () => {
    const storage = memoryAdapter();
    const a = createGridModel({ ...makeConfig(), storage });
    a.setColumnWidth('name', 300);
    a.toggleColumnVisible('age');

    // Second grid, same storage — should pick up the persisted values.
    const b = createGridModel({ ...makeConfig(), storage });
    expect(b.getState().columns.widths.name).toBe(300);
    expect(b.getVisibleColumns().map((c) => c.field)).toEqual(['name']);
  });

  it('reorderColumnByField persists through to storage', () => {
    const storage = memoryAdapter();
    const a = createGridModel({ ...makeConfig(), storage });
    a.reorderColumnByField('age', 0);

    const b = createGridModel({ ...makeConfig(), storage });
    expect(b.getState().columns.order).toEqual(['age', 'name']);
  });

  it('freezeColumnByField persists through to storage', () => {
    const storage = memoryAdapter();
    const a = createGridModel({ ...makeConfig(), storage });
    a.freezeColumnByField('name', 'left');

    const b = createGridModel({ ...makeConfig(), storage });
    expect(b.getState().columns.frozen).toContain('name');
  });

  it('two grids with distinct persistenceKey do not collide', () => {
    const storage = memoryAdapter();
    const a = createGridModel({
      ...makeConfig(),
      storage,
      persistenceKey: 'gridA',
    });
    const b = createGridModel({
      ...makeConfig(),
      storage,
      persistenceKey: 'gridB',
    });
    a.setColumnWidth('name', 200);
    b.setColumnWidth('name', 400);

    const aReload = createGridModel({
      ...makeConfig(),
      storage,
      persistenceKey: 'gridA',
    });
    const bReload = createGridModel({
      ...makeConfig(),
      storage,
      persistenceKey: 'gridB',
    });
    expect(aReload.getState().columns.widths.name).toBe(200);
    expect(bReload.getState().columns.widths.name).toBe(400);
  });

  it('without storage, column state lives in-memory only (unchanged behavior)', () => {
    const a = createGridModel(makeConfig());
    a.setColumnWidth('name', 240);
    expect(a.getState().columns.widths.name).toBe(240);

    // A new grid without shared state starts at the config defaults.
    const b = createGridModel(makeConfig());
    expect(b.getState().columns.widths.name).toBe(160);
  });
});
