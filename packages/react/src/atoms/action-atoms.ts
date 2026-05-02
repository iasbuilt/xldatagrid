/**
 * Write-only Jotai atoms that encapsulate every mutation the datagrid supports.
 *
 * Each action atom is a `WritableAtom<null, Args, void>`: it has no readable
 * value and is invoked exclusively through `set(actionAtom, ...args)`. Actions
 * coordinate reads from {@link BaseAtoms} and {@link DerivedAtoms}, perform
 * immutable state updates, push undo/redo commands enriched with `_atomMeta`,
 * and dispatch matching events on the {@link EventBus} so extensions can react.
 *
 * The undo/redo system deserves special attention: rather than relying on the
 * core `Command.undo()` / `Command.redo()` callbacks (which mutate in place),
 * each command carries an `_atomMeta` sidecar that the local
 * {@link applyCommandToData} helper uses to replay changes immutably against
 * the data atom. This keeps every state transition compatible with Jotai's
 * immutable-reference model.
 *
 * @module action-atoms
 */
import { atom, type WritableAtom } from 'jotai/vanilla';
import type {
  CellAddress,
  CellValue,
  SortState,
  FilterState,
  ColumnDef,
  RowKeyResolver,
} from '@iasbuilt/datagrid-core';
import {
  applySorting,
  toggleSort,
  selectCell,
  selectRow,
  selectColumn,
  extendSelection,
  extendRowSelection,
  clearSelection,
  selectAll,
  beginEdit as beginEditState,
  commitEdit as commitEditState,
  cancelEdit as cancelEditState,
  pushCommand,
  createCellEditCommand,
  createRowInsertCommand,
  createRowDeleteCommand,
  resizeColumn,
  reorderColumn,
  toggleColumnVisibility,
  freezeColumn,
  getVisibleColumns,
  undo as undoOp,
  redo as redoOp,
  type EventBus,
} from '@iasbuilt/datagrid-core';
import type { BaseAtoms } from './base-atoms';
import type { DerivedAtoms } from './derived-atoms';

/**
 * Convenience alias for a write-only Jotai atom: reads as `null`, accepts
 * `Args` on write, and returns `void`.
 *
 * @typeParam Args - Tuple of arguments accepted by the atom's write function.
 */
// Write-only atom type helper: read void, write with Args, return void
type WriteOnlyAtom<Args extends unknown[]> = WritableAtom<null, Args, void>;

/**
 * Shape of the write-only action atom bundle produced by
 * {@link createActionAtoms}.
 *
 * Atoms are grouped by domain: cell editing, row operations, sorting,
 * filtering, selection, column layout, and undo/redo.
 *
 * @typeParam TData - Row data type for the grid. Defaults to a generic record.
 */
export interface ActionAtoms<TData = Record<string, unknown>> {
  /** Set a single cell's value and record the edit in the undo stack. */
  setCellValueAtom: WriteOnlyAtom<[cell: CellAddress, value: unknown]>;
  /** Transition the editing state machine into editing mode for a cell. */
  beginEditAtom: WriteOnlyAtom<[cell: CellAddress]>;
  /** Commit the in-progress edit, persisting the buffered value to data. */
  commitEditAtom: WriteOnlyAtom<[]>;
  /** Discard the in-progress edit without modifying data. */
  cancelEditAtom: WriteOnlyAtom<[]>;
  /** Splice a new row into the data array at the given index. */
  insertRowAtom: WriteOnlyAtom<[index: number, data?: Record<string, unknown>]>;
  /** Remove one or more rows by their keys (in reverse-index order for safety). */
  deleteRowsAtom: WriteOnlyAtom<[rowIds: string[]]>;
  /** Replace the sort state wholesale. */
  sortActionAtom: WriteOnlyAtom<[sortState: SortState]>;
  /** Toggle sort direction for a column, optionally preserving existing sorts. */
  toggleColumnSortAtom: WriteOnlyAtom<[field: string, multi: boolean]>;
  /** Replace the filter state wholesale, or clear it with `null`. */
  filterActionAtom: WriteOnlyAtom<[filterState: FilterState | null]>;
  /** Set the active selection to a single cell. */
  selectCellAtom: WriteOnlyAtom<[cell: CellAddress]>;
  /** Select an entire row by its key. */
  selectRowAtom: WriteOnlyAtom<[rowId: string]>;
  /** Select an entire column by its field name. */
  selectColumnAtom: WriteOnlyAtom<[field: string]>;
  /** Extend the current selection range to include a target cell (shift-click). */
  extendSelectionAtom: WriteOnlyAtom<[cell: CellAddress]>;
  /** Extend the current selection to cover every row between the anchor and the target (Shift+click on a row-number cell). */
  extendRowSelectionAtom: WriteOnlyAtom<[rowId: string]>;
  /** Select all cells across every visible column and row. */
  selectAllAtom: WriteOnlyAtom<[]>;
  /** Clear the current selection entirely. */
  clearSelectionAtom: WriteOnlyAtom<[]>;
  /** Resize a column to a specific pixel width. */
  setColumnWidthAtom: WriteOnlyAtom<[field: string, width: number]>;
  /** Move a column to a new position in the visible order. */
  reorderColumnAtom: WriteOnlyAtom<[field: string, toIndex: number]>;
  /** Toggle a column between visible and hidden. */
  toggleColumnVisibleAtom: WriteOnlyAtom<[field: string]>;
  /** Pin a column to the left edge, right edge, or unpin it. */
  freezeColumnAtom: WriteOnlyAtom<[field: string, position: 'left' | 'right' | null]>;
  /** Undo the most recent undoable command by replaying its `_atomMeta`. */
  undoAtom: WriteOnlyAtom<[]>;
  /** Redo the most recently undone command by replaying its `_atomMeta`. */
  redoAtom: WriteOnlyAtom<[]>;
}

/**
 * Construct every write-only action atom for a grid instance.
 *
 * Each atom closes over the shared `baseAtoms`, `derivedAtoms`, `eventBus`,
 * and `resolveRowKey` so individual call-sites only need to supply
 * domain-specific arguments (e.g. a {@link CellAddress} for editing).
 *
 * @typeParam TData - Row data type constrained to a string-keyed record.
 * @param baseAtoms - Primitive writable atoms that actions read from and
 *   write to.
 * @param derivedAtoms - Read-only projections used when an action needs
 *   derived state (e.g. visible columns for "select all").
 * @param eventBus - Event dispatcher for broadcasting state changes to
 *   the extension/plugin system.
 * @param resolveRowKey - Callback that extracts a stable unique key from a
 *   row, used to locate rows by ID within the data array.
 * @returns An {@link ActionAtoms} bundle of write-only atoms.
 *
 * @example
 * ```ts
 * const actions = createActionAtoms(base, derived, eventBus, resolveRowKey);
 * store.set(actions.setCellValueAtom, { rowId: '1', field: 'name' }, 'Alice');
 * store.set(actions.undoAtom); // reverts the edit above
 * ```
 */
export function createActionAtoms<TData extends Record<string, unknown>>(
  baseAtoms: BaseAtoms<TData>,
  derivedAtoms: DerivedAtoms<TData>,
  eventBus: EventBus,
  resolveRowKey: RowKeyResolver<TData>,
): ActionAtoms<TData> {
  // --- Cell editing ---

  /**
   * Directly set a cell's value, record an undoable command with `_atomMeta`,
   * and broadcast a `cell:valueChange` event.
   */
  const setCellValueAtom = atom(
    null,
    (get, set, cell: CellAddress, value: unknown) => {
      const data = get(baseAtoms.dataAtom);

      // Resolve the numeric index of the target row from its string key.
      const rowIds = data.map(resolveRowKey);
      const rowIndex = rowIds.indexOf(cell.rowId);
      if (rowIndex === -1) return;

      // Capture the old value before mutation for undo support.
      const currentRow = data[rowIndex];
      if (!currentRow) return;
      const oldValue = currentRow[cell.field as keyof TData];

      // Build a new data array with the updated row (immutable).
      const newData = [...data];
      const newRow = { ...currentRow } as TData;
      (newRow as Record<string, unknown>)[cell.field] = value;
      newData[rowIndex] = newRow;

      // Create a command that stores field/index/values for atom-aware undo/redo.
      // We attach metadata so the undoAtom can apply changes immutably.
      const cmd: import('@iasbuilt/datagrid-core').Command & { _atomMeta?: any } = {
        type: 'cell:edit',
        timestamp: Date.now(),
        description: `Edit ${cell.field}`,
        undo: () => { /* handled by undoAtom */ },
        redo: () => { /* handled by redoAtom */ },
        _atomMeta: { kind: 'cell:edit', rowIndex, field: cell.field, oldValue, newValue: value },
      };

      // Commit the new data and push the command onto the undo stack.
      set(baseAtoms.dataAtom, newData);
      set(baseAtoms.undoRedoAtom, pushCommand(get(baseAtoms.undoRedoAtom), cmd));

      // Notify the event bus so extensions can react to the value change.
      eventBus.dispatch('cell:valueChange', { cell, oldValue, newValue: value });
    },
  );

  /**
   * Transition the editing state machine into active editing for a cell,
   * pre-loading the cell's current value into the edit buffer.
   */
  const beginEditAtom = atom(
    null,
    (get, set, cell: CellAddress) => {
      const data = get(baseAtoms.dataAtom);

      // Locate the target row by key to read its current cell value.
      const rowIds = data.map(resolveRowKey);
      const rowIndex = rowIds.indexOf(cell.rowId);
      if (rowIndex === -1) return;

      // Load the current value into the editing state machine's buffer.
      const currentRow = data[rowIndex];
      if (!currentRow) return;
      const value = currentRow[cell.field as keyof TData] as CellValue;
      set(baseAtoms.editingAtom, beginEditState(get(baseAtoms.editingAtom), cell, value));
    },
  );

  /**
   * Finalise the in-progress edit: persist the buffered value to the data
   * atom, record an undo command, broadcast the change, then reset the
   * editing state machine.
   */
  const commitEditAtom = atom(
    null,
    (get, set) => {
      const editing = get(baseAtoms.editingAtom);
      const result = commitEditState(editing);
      if (result) {
        // Delegate to the same immutable-update logic as setCellValueAtom.
        const data = get(baseAtoms.dataAtom);
        const rowIds = data.map(resolveRowKey);
        const rowIndex = rowIds.indexOf(result.cell.rowId);
        if (rowIndex !== -1) {
          // Capture old value and build immutable replacement.
          const currentRow = data[rowIndex];
          if (!currentRow) return;
          const oldValue = currentRow[result.cell.field as keyof TData];
          const newData = [...data];
          const newRow = { ...currentRow } as TData;
          (newRow as Record<string, unknown>)[result.cell.field] = result.value;
          newData[rowIndex] = newRow;

          // Record the edit command with _atomMeta for immutable undo/redo.
          const cmd: import('@iasbuilt/datagrid-core').Command & { _atomMeta?: any } = {
            type: 'cell:edit',
            timestamp: Date.now(),
            description: `Edit ${result.cell.field}`,
            undo: () => { /* handled by undoAtom */ },
            redo: () => { /* handled by redoAtom */ },
            _atomMeta: { kind: 'cell:edit', rowIndex, field: result.cell.field, oldValue, newValue: result.value },
          };

          set(baseAtoms.dataAtom, newData);
          set(baseAtoms.undoRedoAtom, pushCommand(get(baseAtoms.undoRedoAtom), cmd));

          eventBus.dispatch('cell:valueChange', {
            cell: result.cell,
            oldValue,
            newValue: result.value,
          });
        }
      }
      // Always reset editing state, even if the commit produced no data change.
      set(baseAtoms.editingAtom, cancelEditState(editing));
    },
  );

  /**
   * Discard the in-progress edit, returning the editing state machine to
   * idle without modifying the data atom.
   */
  const cancelEditAtom = atom(
    null,
    (get, set) => {
      set(baseAtoms.editingAtom, cancelEditState(get(baseAtoms.editingAtom)));
    },
  );

  // --- Row operations ---

  /**
   * Insert a new row at a specific index, record an undoable command, and
   * broadcast a `row:insert` event. If no row data is provided an empty
   * object is used.
   */
  const insertRowAtom = atom(
    null,
    (get, set, index: number, rowData?: Record<string, unknown>) => {
      const newRow = (rowData ?? {}) as TData;
      const data = get(baseAtoms.dataAtom);

      // Splice the new row into an immutable copy of the data array.
      const newData = [...data];
      newData.splice(index, 0, newRow);

      // Record the insertion with _atomMeta so undo can remove the row
      // and redo can re-insert it at the same position.
      const cmd: import('@iasbuilt/datagrid-core').Command & { _atomMeta?: any } = {
        type: 'row:insert',
        timestamp: Date.now(),
        description: 'Insert row',
        undo: () => { /* handled by undoAtom */ },
        redo: () => { /* handled by redoAtom */ },
        _atomMeta: { kind: 'row:insert', index, row: newRow },
      };

      set(baseAtoms.dataAtom, newData);
      set(baseAtoms.undoRedoAtom, pushCommand(get(baseAtoms.undoRedoAtom), cmd));

      eventBus.dispatch('row:insert', { index, data: newRow });
    },
  );

  /**
   * Delete one or more rows identified by their keys. Rows are removed in
   * descending index order so earlier splice operations do not shift the
   * positions of later targets. Each deletion is recorded as a separate
   * undo command.
   */
  const deleteRowsAtom = atom(
    null,
    (get, set, rowIds: string[]) => {
      const data = get(baseAtoms.dataAtom);

      // Map requested row keys to their current indices, discarding any
      // that are not found, and sort descending so splices are stable.
      const allRowIds = data.map(resolveRowKey);
      const entries = rowIds
        .map((rowId) => ({ rowId, index: allRowIds.indexOf(rowId) }))
        .filter((e) => e.index !== -1)
        .sort((a, b) => b.index - a.index);

      let newData = [...data];
      let undoRedo = get(baseAtoms.undoRedoAtom);
      const subcmds: (import('@iasbuilt/datagrid-core').Command & { _atomMeta?: any })[] = [];

      // Process deletions one at a time (descending) to keep indices valid.
      for (const { index } of entries) {
        const row = newData[index];
        if (!row) continue;
        const cmd: import('@iasbuilt/datagrid-core').Command & { _atomMeta?: any } = {
          type: 'row:delete',
          timestamp: Date.now(),
          description: 'Delete row',
          undo: () => { /* handled by undoAtom */ },
          redo: () => { /* handled by redoAtom */ },
          _atomMeta: { kind: 'row:delete', index, row },
        };
        newData = [...newData];
        newData.splice(index, 1);
        undoRedo = pushCommand(undoRedo, cmd);
      }

      set(baseAtoms.dataAtom, newData);
      set(baseAtoms.undoRedoAtom, undoRedo);

      eventBus.dispatch('row:delete', { rowIds });
    },
  );

  // --- Sorting ---

  /**
   * Replace the entire sort state and broadcast a `column:sort` event.
   */
  const sortActionAtom = atom(
    null,
    (_get, set, sortState: SortState) => {
      set(baseAtoms.sortAtom, sortState);
      eventBus.dispatch('column:sort', { sort: sortState });
    },
  );

  /**
   * Cycle a column through ascending / descending / unsorted. When `multi`
   * is true the existing sort descriptors for other columns are preserved;
   * otherwise they are replaced.
   */
  const toggleColumnSortAtom = atom(
    null,
    (get, set, field: string, multi: boolean) => {
      const current = get(baseAtoms.sortAtom);
      // Delegate to the core toggleSort utility which handles the
      // three-state cycle and multi-column logic.
      const newSort = toggleSort(current, field, multi);
      set(baseAtoms.sortAtom, newSort);
      eventBus.dispatch('column:sort', { sort: newSort });
    },
  );

  // --- Filtering ---

  /**
   * Replace the entire filter state (or clear it with `null`) and broadcast
   * a `column:filter` event.
   */
  const filterActionAtom = atom(
    null,
    (_get, set, filterState: FilterState | null) => {
      set(baseAtoms.filterAtom, filterState);
      eventBus.dispatch('column:filter', { filter: filterState });
    },
  );

  // --- Selection ---

  /**
   * Set the active selection to a single cell and broadcast the change.
   */
  const selectCellAtom = atom(
    null,
    (get, set, cell: CellAddress) => {
      const selection = get(baseAtoms.selectionAtom);
      const newSelection = selectCell(selection, cell);
      set(baseAtoms.selectionAtom, newSelection);
      eventBus.dispatch('cell:selectionChange', { selection: newSelection.range });
    },
  );

  /**
   * Select all cells in a row, spanning every visible column.
   */
  const selectRowAtom = atom(
    null,
    (get, set, rowId: string) => {
      const selection = get(baseAtoms.selectionAtom);
      // Visible columns are needed to determine the selection's column span.
      const cols = getVisibleColumns(get(baseAtoms.columnsAtom)) as ColumnDef[];
      set(baseAtoms.selectionAtom, selectRow(selection, rowId, cols));
    },
  );

  /**
   * Select all cells in a column, spanning every row in the current data.
   */
  const selectColumnAtom = atom(
    null,
    (get, set, field: string) => {
      const selection = get(baseAtoms.selectionAtom);
      // Row IDs are needed to determine the selection's row span.
      const data = get(baseAtoms.dataAtom);
      const rowIds = data.map(resolveRowKey);
      set(baseAtoms.selectionAtom, selectColumn(selection, field, rowIds));
    },
  );

  /**
   * Extend the current selection range to include the given cell (typically
   * triggered by shift-click or shift-arrow interactions).
   */
  const extendSelectionAtom = atom(
    null,
    (get, set, cell: CellAddress) => {
      const selection = get(baseAtoms.selectionAtom);
      set(baseAtoms.selectionAtom, extendSelection(selection, cell));
    },
  );

  /**
   * Extend the current selection to a full-row range anchored on whichever
   * row was last selected. Triggered by Shift+click on a chrome row-number
   * cell; snaps the anchor/focus to the first/last visible columns and tags
   * the range with `kind: 'row'` so the renderer paints it as a row-level
   * outline irrespective of `selectionMode`.
   */
  const extendRowSelectionAtom = atom(
    null,
    (get, set, rowId: string) => {
      const selection = get(baseAtoms.selectionAtom);
      const cols = getVisibleColumns(get(baseAtoms.columnsAtom)) as ColumnDef[];
      set(baseAtoms.selectionAtom, extendRowSelection(selection, rowId, cols));
    },
  );

  /**
   * Select every cell in the grid by spanning all visible columns and all
   * rows.
   */
  const selectAllAtom = atom(
    null,
    (get, set) => {
      const selection = get(baseAtoms.selectionAtom);
      const cols = getVisibleColumns(get(baseAtoms.columnsAtom)) as ColumnDef[];
      const data = get(baseAtoms.dataAtom);
      const rowIds = data.map(resolveRowKey);
      set(baseAtoms.selectionAtom, selectAll(selection, cols, rowIds));
    },
  );

  /**
   * Reset the selection to an empty/cleared state.
   */
  const clearSelectionAtom = atom(
    null,
    (get, set) => {
      set(baseAtoms.selectionAtom, clearSelection(get(baseAtoms.selectionAtom)));
    },
  );

  // --- Column operations ---

  /**
   * Update a column's pixel width and broadcast a `column:resize` event.
   */
  const setColumnWidthAtom = atom(
    null,
    (get, set, field: string, width: number) => {
      const columns = get(baseAtoms.columnsAtom);
      set(baseAtoms.columnsAtom, resizeColumn(columns, field, width));
      eventBus.dispatch('column:resize', { field, width });
    },
  );

  /**
   * Move a column to a new position in the visible order and broadcast a
   * `column:reorder` event.
   */
  const reorderColumnAtom = atom(
    null,
    (get, set, field: string, toIndex: number) => {
      const columns = get(baseAtoms.columnsAtom);
      set(baseAtoms.columnsAtom, reorderColumn(columns, field, toIndex));
      eventBus.dispatch('column:reorder', { field, toIndex });
    },
  );

  /**
   * Toggle a column between visible and hidden, then broadcast a
   * `column:visibility` event.
   */
  const toggleColumnVisibleAtom = atom(
    null,
    (get, set, field: string) => {
      const columns = get(baseAtoms.columnsAtom);
      set(baseAtoms.columnsAtom, toggleColumnVisibility(columns, field));
      eventBus.dispatch('column:visibility', { field });
    },
  );

  /**
   * Pin a column to the left edge, right edge, or unpin it by passing
   * `null`.
   */
  const freezeColumnAtom = atom(
    null,
    (get, set, field: string, position: 'left' | 'right' | null) => {
      const columns = get(baseAtoms.columnsAtom);
      set(baseAtoms.columnsAtom, freezeColumn(columns, field, position));
    },
  );

  // --- Undo / Redo ---

  /**
   * Replay a single command's data-level side effects immutably using the
   * `_atomMeta` sidecar attached to each command.
   *
   * Supports four meta kinds:
   * - `cell:edit` -- restores the old or new cell value depending on direction.
   * - `row:insert` -- removes or re-inserts the row.
   * - `row:delete` -- re-inserts or removes the row.
   * - `batch` -- recursively applies sub-commands in the appropriate order.
   *
   * Falls back to the command's original `undo()` / `redo()` callbacks (which
   * may mutate in place) when no recognised `_atomMeta` is present, then
   * forces a fresh reference on the data atom so Jotai detects the change.
   *
   * @param get - Jotai getter scoped to the current write transaction.
   * @param set - Jotai setter scoped to the current write transaction.
   * @param cmd - The command (with optional `_atomMeta`) to replay.
   * @param direction - Whether to undo or redo the command.
   */
  // Helper: apply a command's undo/redo using atom metadata for immutable updates
  function applyCommandToData(
    get: (atom: any) => any,
    set: (atom: any, ...args: any[]) => void,
    cmd: import('@iasbuilt/datagrid-core').Command & { _atomMeta?: any },
    direction: 'undo' | 'redo',
  ) {
    const meta = cmd._atomMeta;
    if (meta?.kind === 'cell:edit') {
      // Restore old value on undo, new value on redo.
      const data = get(baseAtoms.dataAtom);
      const val = direction === 'undo' ? meta.oldValue : meta.newValue;
      const updated = [...data];
      const existingRow = updated[meta.rowIndex];
      if (existingRow) {
        updated[meta.rowIndex] = { ...existingRow, [meta.field]: val } as TData;
      }
      set(baseAtoms.dataAtom, updated as TData[]);
    } else if (meta?.kind === 'row:insert') {
      // Undo an insertion by removing; redo by re-inserting.
      const data = get(baseAtoms.dataAtom);
      const updated = [...data];
      if (direction === 'undo') {
        updated.splice(meta.index, 1);
      } else {
        updated.splice(meta.index, 0, meta.row as TData);
      }
      set(baseAtoms.dataAtom, updated as TData[]);
    } else if (meta?.kind === 'row:delete') {
      // Undo a deletion by re-inserting; redo by removing again.
      const data = get(baseAtoms.dataAtom);
      const updated = [...data];
      if (direction === 'undo') {
        updated.splice(meta.index, 0, meta.row as TData);
      } else {
        updated.splice(meta.index, 1);
      }
      set(baseAtoms.dataAtom, updated as TData[]);
    } else if (meta?.kind === 'batch') {
      // Batch commands must be replayed in reverse order when undoing
      // so that index-sensitive operations (splices) remain valid.
      const cmds = meta.commands as (import('@iasbuilt/datagrid-core').Command & { _atomMeta?: any })[];
      const ordered = direction === 'undo' ? [...cmds].reverse() : cmds;
      for (const sub of ordered) applyCommandToData(get, set, sub, direction);
    } else {
      // Fallback: call original command undo/redo (in-place mutation) + refresh ref
      if (direction === 'undo') cmd.undo(); else cmd.redo();
      set(baseAtoms.dataAtom, [...get(baseAtoms.dataAtom)] as TData[]);
    }
  }

  /**
   * Pop the most recent command from the undo stack, reverse its data-level
   * effects via {@link applyCommandToData}, and push it onto the redo stack.
   */
  const undoAtom = atom(
    null,
    (get, set) => {
      const state = get(baseAtoms.undoRedoAtom);
      // Guard: nothing to undo.
      if (state.undoStack.length === 0) return;

      // Pop the last command from the undo stack.
      const undoStack = [...state.undoStack];
      const cmd = undoStack.pop()!;

      // Apply the reverse operation immutably.
      applyCommandToData(get, set, cmd, 'undo');

      // Move the command to the redo stack.
      set(baseAtoms.undoRedoAtom, { ...state, undoStack, redoStack: [...state.redoStack, cmd] });
    },
  );

  /**
   * Pop the most recent command from the redo stack, re-apply its data-level
   * effects via {@link applyCommandToData}, and push it back onto the undo
   * stack.
   */
  const redoAtom = atom(
    null,
    (get, set) => {
      const state = get(baseAtoms.undoRedoAtom);
      // Guard: nothing to redo.
      if (state.redoStack.length === 0) return;

      // Pop the last command from the redo stack.
      const redoStack = [...state.redoStack];
      const cmd = redoStack.pop()!;

      // Re-apply the forward operation immutably.
      applyCommandToData(get, set, cmd, 'redo');

      // Move the command back to the undo stack.
      set(baseAtoms.undoRedoAtom, { ...state, redoStack, undoStack: [...state.undoStack, cmd] });
    },
  );

  return {
    setCellValueAtom,
    beginEditAtom,
    commitEditAtom,
    cancelEditAtom,
    insertRowAtom,
    deleteRowsAtom,
    sortActionAtom,
    toggleColumnSortAtom,
    filterActionAtom,
    selectCellAtom,
    selectRowAtom,
    selectColumnAtom,
    extendSelectionAtom,
    extendRowSelectionAtom,
    selectAllAtom,
    clearSelectionAtom,
    setColumnWidthAtom,
    reorderColumnAtom,
    toggleColumnVisibleAtom,
    freezeColumnAtom,
    undoAtom,
    redoAtom,
  };
}
