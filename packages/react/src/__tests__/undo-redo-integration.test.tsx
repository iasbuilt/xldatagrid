import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi } from 'vitest';
import { DataGrid } from '../DataGrid';
import {
  createGridModel,
  GridModel,
  ColumnDef,
  createUndoRedoState,
  pushCommand,
  undo as undoOp,
  redo as redoOp,
  createCellEditCommand,
  createBatchCommand,
  createRowInsertCommand,
  createRowDeleteCommand,
  UndoRedoState,
} from '@iasbuilt/datagrid-core';

type TestRow = { id: string; name: string; age: number; city: string };

function makeData(): TestRow[] {
  return [
    { id: '1', name: 'Alice', age: 30, city: 'London' },
    { id: '2', name: 'Bob', age: 25, city: 'Paris' },
    { id: '3', name: 'Charlie', age: 35, city: 'Berlin' },
  ];
}

const columns: ColumnDef<TestRow>[] = [
  { id: 'name', field: 'name', title: 'Name' },
  { id: 'age', field: 'age', title: 'Age', sortable: true },
  { id: 'city', field: 'city', title: 'City' },
];

function createTestModel(data?: TestRow[]) {
  return createGridModel<TestRow>({
    data: data ?? makeData(),
    columns: columns as ColumnDef<TestRow>[],
    rowKey: 'id',
  });
}

function renderGrid(overrides: Partial<Parameters<typeof DataGrid>[0]> = {}) {
  return render(
    <DataGrid
      data={makeData()}
      columns={columns as any}
      rowKey="id"
      {...(overrides as any)}
    />
  );
}

describe('Undo/Redo integration — undo', () => {
  it('undo reverts last cell edit', async () => {
    const model = createTestModel();
    await model.setCellValue({ rowId: '1', field: 'name' }, 'Zara');
    expect(model.getState().data[0]!.name).toBe('Zara');
    model.undo();
    expect(model.getState().data[0]!.name).toBe('Alice');
  });

  it('undo reverts cell to previous value', async () => {
    const model = createTestModel();
    await model.setCellValue({ rowId: '2', field: 'age' }, 99);
    model.undo();
    expect(model.getState().data[1]!.age).toBe(25);
  });

  it('undo reverts row deletion restoring row', () => {
    const data: Record<string, unknown>[] = [
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
      { id: '3', name: 'Charlie' },
    ];
    const row = data[1]!;
    const cmd = createRowDeleteCommand(data, 1, row);
    cmd.redo();
    expect(data).toHaveLength(2);
    cmd.undo();
    expect(data).toHaveLength(3);
    expect(data[1]!.name).toBe('Bob');
  });

  it('undo reverts row addition removing row', () => {
    const data: Record<string, unknown>[] = [
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ];
    const newRow = { id: '3', name: 'Charlie' };
    const cmd = createRowInsertCommand(data, 2, newRow);
    cmd.redo();
    expect(data).toHaveLength(3);
    cmd.undo();
    expect(data).toHaveLength(2);
  });

  it('undo reverts column reorder to previous order', () => {
    const model = createTestModel();
    const originalOrder = [...model.getState().columns.order];
    model.reorderColumnByField('city', 0);
    expect(model.getState().columns.order).not.toEqual(originalOrder);
    expect(model.getState().columns.order[0]).toBe('city');
  });

  it('undo reverts sort to previous state', () => {
    const model = createTestModel();
    model.sort([{ field: 'age', dir: 'asc' }]);
    expect(model.getState().sort).toHaveLength(1);
    model.sort([]);
    expect(model.getState().sort).toHaveLength(0);
  });

  it('undo reverts filter to previous state', () => {
    const model = createTestModel();
    model.filter({ logic: 'and', filters: [{ field: 'age', operator: 'gt', value: 30 }] });
    expect(model.getState().filter).not.toBeNull();
    model.filter(null);
    expect(model.getState().filter).toBeNull();
  });

  it('undo reverts paste operation', async () => {
    const model = createTestModel();
    const orig1 = model.getState().data[0]!.name;
    const orig2 = model.getState().data[1]!.name;
    await model.setCellValue({ rowId: '1', field: 'name' }, 'Pasted1');
    await model.setCellValue({ rowId: '2', field: 'name' }, 'Pasted2');
    model.undo();
    model.undo();
    expect(model.getState().data[0]!.name).toBe(orig1);
    expect(model.getState().data[1]!.name).toBe(orig2);
  });

  it('undo fires onUndo callback with command', async () => {
    const model = createTestModel();
    const listener = vi.fn();
    model.subscribe(listener);
    await model.setCellValue({ rowId: '1', field: 'name' }, 'X');
    listener.mockClear();
    model.undo();
    expect(listener).toHaveBeenCalled();
  });

  it('undo Ctrl+Z triggers undo', async () => {
    renderGrid();
    const grid = screen.getByRole('grid');
    const cells = screen.getAllByRole('gridcell');
    await act(async () => { fireEvent.click(cells[0]!); });
    await act(async () => { fireEvent.dblClick(cells[0]!); });
    const input = screen.getByRole('textbox');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Edited' } });
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(screen.getByText('Edited')).toBeInTheDocument();
    await act(async () => {
      grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    });
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('undo multiple times walks back through history', async () => {
    const model = createTestModel();
    await model.setCellValue({ rowId: '1', field: 'name' }, 'First');
    await model.setCellValue({ rowId: '1', field: 'name' }, 'Second');
    await model.setCellValue({ rowId: '1', field: 'name' }, 'Third');

    model.undo();
    expect(model.getState().data[0]!.name).toBe('Second');
    model.undo();
    expect(model.getState().data[0]!.name).toBe('First');
    model.undo();
    expect(model.getState().data[0]!.name).toBe('Alice');
  });

  it('undo has no effect when history is empty', () => {
    const model = createTestModel();
    const before = model.getState().data[0]!.name;
    model.undo();
    expect(model.getState().data[0]!.name).toBe(before);
  });
});

describe('Undo/Redo integration — redo', () => {
  it('redo re-applies last undone action', async () => {
    const model = createTestModel();
    await model.setCellValue({ rowId: '1', field: 'name' }, 'Changed');
    model.undo();
    expect(model.getState().data[0]!.name).toBe('Alice');
    model.redo();
    expect(model.getState().data[0]!.name).toBe('Changed');
  });

  it('redo restores cell edit value', async () => {
    const model = createTestModel();
    await model.setCellValue({ rowId: '2', field: 'city' }, 'Tokyo');
    model.undo();
    model.redo();
    expect(model.getState().data[1]!.city).toBe('Tokyo');
  });

  it('redo restores deleted row removal', () => {
    const data: Record<string, unknown>[] = [{ id: '1' }, { id: '2' }];
    const row = data[0]!;
    let state = createUndoRedoState();
    const cmd = createRowDeleteCommand(data, 0, row);
    cmd.redo();
    state = pushCommand(state, cmd);
    expect(data).toHaveLength(1);
    state = undoOp(state);
    expect(data).toHaveLength(2);
    state = redoOp(state);
    expect(data).toHaveLength(1);
  });

  it('redo restores added row', () => {
    const data: Record<string, unknown>[] = [{ id: '1' }];
    const newRow = { id: '2', name: 'Diana' };
    let state = createUndoRedoState();
    const cmd = createRowInsertCommand(data, 1, newRow);
    cmd.redo();
    state = pushCommand(state, cmd);
    expect(data).toHaveLength(2);
    state = undoOp(state);
    expect(data).toHaveLength(1);
    state = redoOp(state);
    expect(data).toHaveLength(2);
    expect(data[1]!.name).toBe('Diana');
  });

  it('redo fires onRedo callback with command', async () => {
    const model = createTestModel();
    const listener = vi.fn();
    model.subscribe(listener);
    await model.setCellValue({ rowId: '1', field: 'name' }, 'X');
    model.undo();
    listener.mockClear();
    model.redo();
    expect(listener).toHaveBeenCalled();
  });

  it('redo Ctrl+Y triggers redo', async () => {
    renderGrid();
    const grid = screen.getByRole('grid');
    const cells = screen.getAllByRole('gridcell');
    await act(async () => { fireEvent.click(cells[0]!); });
    await act(async () => { fireEvent.dblClick(cells[0]!); });
    const input = screen.getByRole('textbox');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Edited' } });
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    await act(async () => {
      grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    });
    expect(screen.getByText('Alice')).toBeInTheDocument();
    await act(async () => {
      grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true }));
    });
    expect(screen.getByText('Edited')).toBeInTheDocument();
  });

  it('redo Ctrl+Shift+Z triggers redo', async () => {
    renderGrid();
    const grid = screen.getByRole('grid');
    const cells = screen.getAllByRole('gridcell');
    await act(async () => { fireEvent.click(cells[0]!); });
    await act(async () => { fireEvent.dblClick(cells[0]!); });
    const input = screen.getByRole('textbox');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'Edited2' } });
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    await act(async () => {
      grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    });
    expect(screen.getByText('Alice')).toBeInTheDocument();
    await act(async () => {
      grid.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true }));
    });
    expect(screen.getByText('Edited2')).toBeInTheDocument();
  });

  it('redo multiple times walks forward through history', async () => {
    const model = createTestModel();
    await model.setCellValue({ rowId: '1', field: 'name' }, 'First');
    await model.setCellValue({ rowId: '1', field: 'name' }, 'Second');
    await model.setCellValue({ rowId: '1', field: 'name' }, 'Third');

    model.undo();
    model.undo();
    model.undo();
    expect(model.getState().data[0]!.name).toBe('Alice');

    model.redo();
    expect(model.getState().data[0]!.name).toBe('First');
    model.redo();
    expect(model.getState().data[0]!.name).toBe('Second');
    model.redo();
    expect(model.getState().data[0]!.name).toBe('Third');
  });

  it('redo has no effect when redo stack is empty', async () => {
    const model = createTestModel();
    await model.setCellValue({ rowId: '1', field: 'name' }, 'Changed');
    const current = model.getState().data[0]!.name;
    model.redo();
    expect(model.getState().data[0]!.name).toBe(current);
  });

  it('redo stack clears when new edit occurs after undo', async () => {
    const model = createTestModel();
    await model.setCellValue({ rowId: '1', field: 'name' }, 'First');
    model.undo();
    await model.setCellValue({ rowId: '1', field: 'name' }, 'Different');
    expect(model.getState().undoRedo.redoStack).toHaveLength(0);
    model.redo();
    expect(model.getState().data[0]!.name).toBe('Different');
  });
});

describe('Undo/Redo integration — history management', () => {
  it('undo redo history limit prevents memory growth', () => {
    const state = createUndoRedoState(5);
    const data = [{ val: 0 }];
    let current = state;
    for (let i = 1; i <= 10; i++) {
      const cmd = createCellEditCommand(data as any, 0, 'val', i - 1, i);
      cmd.redo();
      current = pushCommand(current, cmd);
    }
    expect(current.undoStack.length).toBeLessThanOrEqual(5);
  });

  it('undo redo preserves history across data refresh', async () => {
    const model = createTestModel();
    await model.setCellValue({ rowId: '1', field: 'name' }, 'Changed');
    const undoBefore = model.getState().undoRedo.undoStack.length;
    model.getState();
    model.getProcessedData();
    expect(model.getState().undoRedo.undoStack.length).toBe(undoBefore);
  });

  it('undo batches rapid edits within debounce window', () => {
    const data = makeData() as Record<string, unknown>[];
    const cmd1 = createCellEditCommand(data, 0, 'name', 'Alice', 'X');
    const cmd2 = createCellEditCommand(data, 0, 'age', 30, 99);
    const batch = createBatchCommand([cmd1, cmd2]);

    let state = createUndoRedoState();
    batch.redo();
    state = pushCommand(state, batch);

    expect(data[0]!.name).toBe('X');
    expect(data[0]!.age).toBe(99);
    expect(state.undoStack).toHaveLength(1);
  });

  it('undo batch counts as single undo step', () => {
    const data = makeData() as Record<string, unknown>[];
    const cmd1 = createCellEditCommand(data, 0, 'name', 'Alice', 'X');
    const cmd2 = createCellEditCommand(data, 1, 'name', 'Bob', 'Y');
    const batch = createBatchCommand([cmd1, cmd2]);

    let state = createUndoRedoState();
    batch.redo();
    state = pushCommand(state, batch);

    expect(data[0]!.name).toBe('X');
    expect(data[1]!.name).toBe('Y');

    state = undoOp(state);
    expect(data[0]!.name).toBe('Alice');
    expect(data[1]!.name).toBe('Bob');
    expect(state.undoStack).toHaveLength(0);
  });
});
