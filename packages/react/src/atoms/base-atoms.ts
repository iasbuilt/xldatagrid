/**
 * Primitive Jotai atoms that hold the ground-truth, mutable state for a single
 * datagrid instance. Every other atom layer (derived projections and write-only
 * actions) reads from or writes to these atoms. Isolating primitive state here
 * keeps the atom graph shallow and makes it straightforward to initialise a
 * fresh grid from a {@link GridConfig}.
 *
 * @module base-atoms
 */
import { atom, type WritableAtom } from 'jotai/vanilla';
import type {
  GridConfig,
  SortState,
  FilterState,
  RowKeyResolver,
  GroupState,
} from '@iasbuilt/datagrid-core';
import {
  createColumnState,
  type ColumnState,
  createSelection,
  type SelectionState,
  createEditingState,
  type EditingState,
  createUndoRedoState,
  type UndoRedoState,
  createGroupState,
} from '@iasbuilt/datagrid-core';

/**
 * Shape of the primitive atom bundle produced by {@link createGridAtoms}.
 *
 * Each member is a standard Jotai writable atom whose value can be read via
 * `get(atom)` and replaced wholesale via `set(atom, newValue)`.
 *
 * @typeParam TData - Row data type for the grid. Defaults to a generic record.
 */
export interface BaseAtoms<TData = Record<string, unknown>> {
  /** Full data array backing the grid rows. */
  dataAtom: WritableAtom<TData[], [TData[]], void>;
  /** Column definitions, order, widths, visibility, and freeze positions. */
  columnsAtom: WritableAtom<ColumnState<TData>, [ColumnState<TData>], void>;
  /** Active sort descriptors (multi-column supported). */
  sortAtom: WritableAtom<SortState, [SortState], void>;
  /** Active filter tree, or `null` when no filter is applied. */
  filterAtom: WritableAtom<FilterState | null, [FilterState | null], void>;
  /** Current cell/row/column selection state. */
  selectionAtom: WritableAtom<SelectionState, [SelectionState], void>;
  /** In-progress cell editing state (active cell, buffered value). */
  editingAtom: WritableAtom<EditingState, [EditingState], void>;
  /** Undo and redo command stacks for the immutable command history. */
  undoRedoAtom: WritableAtom<UndoRedoState, [UndoRedoState], void>;
  /** Row-grouping configuration (grouped fields and their order). */
  groupStateAtom: WritableAtom<GroupState, [GroupState], void>;
  /** Set of row keys whose detail/child rows are currently expanded. */
  expandedRowsAtom: WritableAtom<Set<string>, [Set<string>], void>;
  /** Set of row keys whose nested sub-grids are currently expanded. */
  expandedSubGridsAtom: WritableAtom<Set<string>, [Set<string>], void>;
  /** Zero-based current page index for pagination. */
  pageAtom: WritableAtom<number, [number], void>;
  /** Number of rows displayed per page. */
  pageSizeAtom: WritableAtom<number, [number], void>;
  /** Snapshot of the original {@link GridConfig} used during initialisation. */
  configAtom: WritableAtom<GridConfig<TData>, [GridConfig<TData>], void>;
}

/**
 * Instantiate a complete set of primitive Jotai atoms for one datagrid,
 * pre-populated from the supplied {@link GridConfig}.
 *
 * The atoms created here own the authoritative state; derived atoms subscribe
 * to them for cached projections and action atoms write back through them.
 * A shallow copy of `config.data` is stored so the caller's original array
 * is never mutated.
 *
 * @typeParam TData - Row data type constrained to a string-keyed record.
 * @param config - Grid configuration containing initial data, column
 *   definitions, selection mode, page size, and other settings.
 * @param _resolveRowKey - Row key resolver (retained for signature symmetry
 *   with the derived/action layers but unused during base-atom creation).
 * @returns A {@link BaseAtoms} bundle ready to be wired into derived and
 *   action atom factories.
 *
 * @example
 * ```ts
 * const base = createGridAtoms(gridConfig, (row) => row.id);
 * const store = createStore();
 * store.set(base.dataAtom, newRows);
 * ```
 */
export function createGridAtoms<TData extends Record<string, unknown>>(
  config: GridConfig<TData>,
  _resolveRowKey: RowKeyResolver<TData>,
): BaseAtoms<TData> {
  // Shallow-copy data so external mutations to the source array do not
  // silently corrupt grid state.
  const dataAtom = atom<TData[]>([...config.data]);

  // Normalise raw ColumnDef[] into the internal ColumnState structure that
  // tracks order, widths, visibility, and freeze positions.
  const columnsAtom = atom<ColumnState<TData>>(createColumnState(config.columns));

  // Sorting and filtering start empty/disabled; consumers apply them via
  // action atoms.
  const sortAtom = atom<SortState>([]);
  const filterAtom = atom<FilterState | null>(null);

  // Selection defaults to the mode declared in config (cell, row, etc.).
  const selectionAtom = atom<SelectionState>(createSelection(config.selectionMode ?? 'cell'));

  // Editing and undo/redo begin in their idle/empty states.
  const editingAtom = atom<EditingState>(createEditingState());
  const undoRedoAtom = atom<UndoRedoState>(createUndoRedoState());

  // Grouping and row-expansion start with no groups and nothing expanded.
  const groupStateAtom = atom<GroupState>(createGroupState());
  const expandedRowsAtom = atom<Set<string>>(new Set<string>());
  const expandedSubGridsAtom = atom<Set<string>>(new Set<string>());

  // Pagination defaults to the first page with the configured page size
  // (falling back to 50 rows when unspecified).
  const pageAtom = atom<number>(0);
  const pageSizeAtom = atom<number>(config.pageSize ?? 50);

  // Retain the full config for downstream consumers that need access to
  // non-atom settings (e.g. custom renderers, feature flags).
  const configAtom = atom<GridConfig<TData>>(config);

  return {
    dataAtom,
    columnsAtom,
    sortAtom,
    filterAtom,
    selectionAtom,
    editingAtom,
    undoRedoAtom,
    groupStateAtom,
    expandedRowsAtom,
    expandedSubGridsAtom,
    pageAtom,
    pageSizeAtom,
    configAtom,
  };
}
