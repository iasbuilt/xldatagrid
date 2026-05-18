/**
 * Central orchestration module for the datagrid's data and interaction lifecycle.
 *
 * Owns canonical grid state via a `@causl/core` graph. Every mutation flows
 * through `graph.commit(intent, tx => …)`, yielding atomic transitions:
 * subscribers see exactly one new value per user-level action, never an
 * intermediate state. Derived selectors (`processedData`, `rowIds`,
 * `visibleColumns`) are `graph.derived` nodes — lazily recomputed only when
 * their inputs change.
 *
 * BYO-graph: callers can pass `config.graph` to register grid state on a
 * shared graph alongside other SPA modules. External derivations
 * (`graph.derived('app:totals', get => aggregate(get(model.nodes.data)))`)
 * then update in the same commit that produced the grid mutation —
 * the foundational reason for the migration from Jotai.
 *
 * @module grid-model
 */
import {
  createCausl,
  type Graph,
  type InputNode,
  type DerivedNode,
} from '@causl/core';
import type { StorageAdapter } from '@causl/persistence';

/**
 * Serialize ColumnState for storage: `hidden` is a `Set<string>` and would
 * become `{}` under raw `JSON.stringify`. We tag-encode it as
 * `{ __set: true, items: [...] }` and decode symmetrically.
 */
function encodeColumnState<TData>(state: ColumnState<TData>): string {
  return JSON.stringify(state, (_k, v) => {
    if (v instanceof Set) return { __set: true, items: Array.from(v) };
    return v;
  });
}
/**
 * Inverse of {@link encodeColumnState}. Reconstructs the `Set` values
 * the column-state shape relies on (currently `hidden`) from the
 * sentinel-tagged envelope they were serialised as, and back-fills
 * any missing fields with `fallback` to defend against stored
 * envelopes from older schema versions.
 */
function decodeColumnState<TData>(raw: string, fallback: ColumnState<TData>): ColumnState<TData> {
  try {
    const parsed = JSON.parse(raw, (_k, v) => {
      if (v && typeof v === 'object' && (v as { __set?: boolean }).__set) {
        return new Set((v as { items: string[] }).items);
      }
      return v;
    }) as ColumnState<TData>;
    // Defence: a stored envelope from an older schema may be missing
    // expected fields. Fall back to config-derived defaults per field.
    return {
      columns: parsed.columns ?? fallback.columns,
      order: parsed.order ?? fallback.order,
      widths: parsed.widths ?? fallback.widths,
      hidden: parsed.hidden instanceof Set ? parsed.hidden : new Set<string>(),
      frozen: parsed.frozen ?? fallback.frozen,
    };
  } catch {
    return fallback;
  }
}
import {
  GridConfig, CellAddress, CellValue, SortState,
  FilterState, Command, GridListener, RowKeyResolver, ColumnDef,
  GridEvent, GridEventType, GridCommands, ExtensionDefinition,
  GroupState,
} from './types';
import { EventBus } from './events';
import { PluginHost } from './plugin';
import {
  createColumnState, ColumnState, resizeColumn, reorderColumn,
  toggleColumnVisibility, freezeColumn, getVisibleColumns,
} from './column-model';
import { applySorting, toggleSort } from './sorting';
import { applyFiltering } from './filtering';
import {
  createSelection, SelectionState, selectCell, selectRow, selectColumn,
  extendSelection, extendRowSelection, clearSelection, selectAll, toggleRowSelection,
} from './selection';
import {
  createEditingState, EditingState, EditCause, beginEdit as beginEditState,
  commitEdit as commitEditState, cancelEdit as cancelEditState,
} from './editing';
import {
  createUndoRedoState, UndoRedoState, pushCommand, undo as undoOp, redo as redoOp,
} from './undo-redo';
import { createGroupState } from './grouping';

/**
 * Bundle of causl nodes that hold and derive grid state. Exposed on
 * {@link GridModel.nodes} so SPA consumers can read directly, register
 * external derivations, or subscribe with fine granularity.
 */
export interface GridNodes<TData = Record<string, unknown>> {
  readonly data: InputNode<TData[]>;
  readonly columns: InputNode<ColumnState<TData>>;
  readonly sort: InputNode<SortState>;
  readonly filter: InputNode<FilterState | null>;
  readonly selection: InputNode<SelectionState>;
  readonly editing: InputNode<EditingState>;
  readonly undoRedo: InputNode<UndoRedoState>;
  readonly groupState: InputNode<GroupState>;
  readonly expandedRows: InputNode<Set<string>>;
  readonly expandedSubGrids: InputNode<Set<string>>;
  readonly page: InputNode<number>;
  readonly pageSize: InputNode<number>;
  readonly config: InputNode<GridConfig<TData>>;
  readonly processedData: DerivedNode<TData[]>;
  readonly rowIds: DerivedNode<string[]>;
  readonly visibleColumns: DerivedNode<ColumnDef<TData>[]>;
}

/**
 * The framework-agnostic imperative façade returned by
 * {@link createGridModel}.
 *
 * Every public mutation in the grid (cell edits, sort / filter / select,
 * row insertion, column reorders, undo / redo, sub-grid expansion,
 * extension registration) lands here and translates into a single
 * `graph.commit('intent', tx => ...)` against the underlying causl graph.
 * Adopters get atomic transitions for free: subscribers see exactly one
 * new value per user-level action, never an intermediate state.
 *
 * The model is **framework-agnostic** — it has zero React imports and is
 * consumed identically by the React adapter (`useGrid`), the MUI wrapper
 * (`MuiDataGrid`), and any future Vue / Svelte / vanilla binding.
 *
 * Two access patterns are supported:
 *
 *   - **Method-based** — call `model.setCellValue(...)`, `model.sort(...)`,
 *     etc. for the standard imperative API. Each method internally runs
 *     one `graph.commit` and dispatches the matching `GridEvent` through
 *     the {@link EventBus}.
 *   - **Graph-based (BYO-graph)** — read or layer derived nodes directly
 *     on top of `model.graph` and `model.nodes.*`. Useful when an SPA
 *     wants its own derived state (pivot panel, URL bar, analytics) to
 *     land atomically alongside grid mutations. See
 *     `playground/spa-integration/` for the canonical example.
 *
 * @typeParam TData - The row data shape. Defaults to a loose
 *   `Record<string, unknown>` for adopters that don't yet model their
 *   rows; tighten it to your row type so `setCellValue` becomes
 *   compile-time-checked against the column field's value type
 *   (closes #104).
 */
export interface GridModel<TData = Record<string, unknown>> {
  /**
   * Underlying causl graph (consumer-supplied via `config.graph` or
   * grid-owned via an internal `createCausl()` call). Always populated.
   *
   * Used by SPA-side consumers that want to layer their own
   * `graph.derived(...)` nodes over grid state, or to subscribe to
   * single fields via `graph.subscribe(model.nodes.X, cb)` for
   * fine-grained re-render control. See `playground/spa-integration/`
   * for a worked example.
   */
  readonly graph: Graph;
  /** Causl nodes holding grid state — see {@link GridNodes}. */
  readonly nodes: GridNodes<TData>;
  getState(): GridModelState<TData>;
  getProcessedData(): TData[];
  getRowIds(): string[];
  getVisibleColumns(): ColumnDef<TData>[];
  /**
   * Set a cell value. Generic-typed so the `value` is checked against
   * the declared `TData[field]` at compile time. Closes
   * iasbuilt/xldatagrid#104 — pairs with `@causl/core`'s
   * `InvariantViolationError` (≥ 0.2.1) as the runtime guard.
   */
  setCellValue<F extends Extract<keyof TData, string>>(
    cell: { rowId: string; field: F },
    value: TData[F],
  ): Promise<void>;
  /**
   * Enters edit mode for the specified cell.
   *
   * @param cell - The cell to begin editing.
   * @param cause - How the edit was initiated. Editor mounts read this
   *   to decide whether to take over input selection on mount; see
   *   {@link EditCause}. Defaults to `'programmatic'`.
   */
  beginEdit(cell: CellAddress, cause?: EditCause): void;
  commitEdit(): Promise<void>;
  cancelEdit(): void;
  insertRow(index: number, data?: Record<string, unknown>): Promise<void>;
  deleteRows(rowIds: string[]): Promise<void>;
  moveRow(fromIndex: number, toIndex: number): Promise<void>;
  toggleRowSelect(rowId: string): void;
  sort(state: SortState): void;
  toggleColumnSort(field: string, multi: boolean): void;
  filter(state: FilterState | null): void;
  select(cell: CellAddress): void;
  selectRowByKey(rowId: string): void;
  selectColumnByField(field: string): void;
  extendTo(cell: CellAddress): void;
  extendRowSelection(rowId: string): void;
  selectAllCells(): void;
  clearSelectionState(): void;
  setColumnWidth(field: string, width: number): void;
  reorderColumnByField(field: string, toIndex: number): void;
  toggleColumnVisible(field: string): void;
  freezeColumnByField(field: string, position: 'left' | 'right' | null): void;
  undo(): void;
  redo(): void;
  toggleSubGridExpansion(rowId: string): void;
  registerExtension(ext: ExtensionDefinition): Promise<void>;
  unregisterExtension(id: string): Promise<void>;
  subscribe(listener: GridListener): () => void;
  dispatch(type: GridEventType, payload?: Record<string, unknown>): Promise<GridEvent>;
  destroy(): Promise<void>;
}

/**
 * Plain-object snapshot of every reactive grid state slice at a single
 * point in time, returned by `model.getState()` and by
 * `useGridStore(model)` in the React adapter.
 *
 * Each field mirrors the value of an input or derived causl node — see
 * {@link GridNodes}. The snapshot is **immutable** by convention:
 * mutating it does NOT update the underlying graph. Callers that want
 * to mutate state must go through a `GridModel` method (which runs a
 * `graph.commit` for atomicity) or compose a `tx.set(node, value)`
 * inside their own commit when working with BYO-graph composition.
 *
 * @typeParam TData - Row data shape, propagated from {@link GridModel}.
 */
export interface GridModelState<TData = Record<string, unknown>> {
  data: TData[];
  columns: ColumnState<TData>;
  sort: SortState;
  filter: FilterState | null;
  selection: SelectionState;
  editing: EditingState;
  undoRedo: UndoRedoState;
  groupState: GroupState;
  expandedRows: Set<string>;
  expandedSubGrids: Set<string>;
  page: number;
  pageSize: number;
  config: GridConfig<TData>;
}

/**
 * Constructs a fresh {@link GridModel} bound to a causl graph.
 *
 * The factory accepts the full {@link GridConfig} adopters pass to
 * `<DataGrid>` (or to `useGrid` in the React adapter). It is the single
 * entry point for instantiating the grid's reactive substrate;
 * everything downstream — including `useGrid`'s React lifecycle —
 * delegates to this function.
 *
 * Two graph-ownership modes are supported:
 *
 *   - **Grid-owned** (default): omit `config.graph` and the factory
 *     creates an internal graph via `createCausl()`. This is the
 *     standalone-component path used by adopters who don't need
 *     SPA-wide state composition.
 *   - **BYO-graph**: pass `config.graph` and an optional
 *     `config.graphNamespace` (defaults to `'grid'`). All grid nodes
 *     register under `${namespace}:<slice>` so multiple grids — and
 *     other SPA state — coexist on a single graph without id
 *     collisions. External `graph.derived(...)` nodes that read from
 *     `model.nodes.*` update atomically inside the same commit that
 *     produced the grid mutation.
 *
 * Row identity is resolved through `config.rowKey`, which may be a
 * string key into `TData` or a `(row) => string` function. The resolved
 * resolver is closed over the model lifetime so row-keyed methods
 * (`selectRowByKey`, `toggleSubGridExpansion`, ...) stay consistent
 * even as `data` changes.
 *
 * @typeParam TData - Row data shape.
 * @param config - Top-level grid configuration object — same shape
 *   `<DataGrid>` accepts.
 * @returns A fully-wired imperative model whose lifetime is owned by
 *   the caller. Call `model.destroy()` on teardown.
 */
export function createGridModel<TData extends Record<string, unknown>>(
  config: GridConfig<TData>
): GridModel<TData> {
  // Normalise the row-key resolver. Adopters may pass either a string
  // field name (cheaper, declarative) or a function (more flexible,
  // e.g. composite keys); the factory closes over a single resolver
  // shape so the rest of the model never re-runs this branch.
  const resolveRowKey: RowKeyResolver<TData> = typeof config.rowKey === 'function'
    ? config.rowKey
    : (row: TData) => String(row[config.rowKey as keyof TData]);

  // BYO-graph: caller may supply a graph for SPA-wide composition; otherwise
  // we own a private graph for backward compatibility.
  const graph: Graph =
    (config.graph as Graph | undefined) ?? createCausl();
  const ns = config.graphNamespace ?? 'grid';
  const nodeId = (key: string) => `${ns}:${key}`;

  // Register input nodes — one per top-level state slice. Reads/writes go
  // through these via `graph.read(node)` / `tx.set(node, value)`.
  // Causl invariant (≥ v0.2.1): validate every staged grid-data write
  // so a string slipping into a numeric column produces a typed
  // `InvariantViolationError` at the commit boundary instead of
  // silently propagating into downstream aggregations (which was the
  // string-concatenation "gigantic salary" bug — iasbuilt/xldatagrid#103).
  // Validator is built once per createGridModel call from the column
  // declarations; columns added later via `config.columns` reactive
  // sync are reflected the next time the editor commits because the
  // invariant captures the live `config.columns` reference.
  const numericFields = new Set(
    config.columns
      .filter((c) => c.cellType === 'numeric' || c.cellType === 'currency')
      .map((c) => String(c.field)),
  );
  const booleanFields = new Set(
    config.columns.filter((c) => c.cellType === 'boolean').map((c) => String(c.field)),
  );
  const dataInvariant = (rows: TData[]): void => {
    if (numericFields.size === 0 && booleanFields.size === 0) return;
    for (let i = 0, n = rows.length; i < n; i++) {
      const row = rows[i] as Record<string, unknown>;
      if (row == null) continue;
      for (const f of numericFields) {
        const v = row[f];
        if (v == null) continue;
        if (typeof v !== 'number' || !Number.isFinite(v)) {
          throw new TypeError(
            `row[${i}].${f}: expected finite number for cellType=numeric/currency, got ${typeof v} (${JSON.stringify(v)})`,
          );
        }
      }
      for (const f of booleanFields) {
        const v = row[f];
        if (v == null) continue;
        if (typeof v !== 'boolean') {
          throw new TypeError(
            `row[${i}].${f}: expected boolean for cellType=boolean, got ${typeof v} (${JSON.stringify(v)})`,
          );
        }
      }
    }
  };
  const dataNode = graph.input<TData[]>(nodeId('data'), [...config.data], {
    invariant: dataInvariant,
  });

  // Column state is the primary UI-preference surface (widths, order,
  // visibility, frozen). When the caller supplies a StorageAdapter, hydrate
  // initial value from storage and mirror future changes back. We can't use
  // `@causl/persistence`'s `persistedInput` here because `ColumnState.hidden`
  // is a `Set` and `persistedInput` uses raw `JSON.stringify` — a Set is
  // lost as `{}`. The thin wrapper below does the Set-aware encode/decode.
  const storage = config.storage as StorageAdapter | undefined;
  const persistenceKey = config.persistenceKey ?? `xldatagrid:${ns}`;
  const columnsStorageKey = `${persistenceKey}:columns`;
  const initialColumns = createColumnState(config.columns);
  const hydratedColumns = (() => {
    if (!storage) return initialColumns;
    const raw = storage.get(columnsStorageKey);
    if (raw === null) return initialColumns;
    return decodeColumnState(raw, initialColumns);
  })();
  const columnsNode = graph.input(nodeId('columns'), hydratedColumns);
  const sortNode = graph.input<SortState>(nodeId('sort'), []);
  const filterNode = graph.input<FilterState | null>(nodeId('filter'), null);
  const selectionNode = graph.input<SelectionState>(
    nodeId('selection'),
    createSelection(config.selectionMode ?? 'cell'),
  );
  const editingNode = graph.input<EditingState>(nodeId('editing'), createEditingState());
  const undoRedoNode = graph.input<UndoRedoState>(nodeId('undoRedo'), createUndoRedoState());
  const groupStateNode = graph.input<GroupState>(nodeId('groupState'), createGroupState());
  const expandedRowsNode = graph.input<Set<string>>(nodeId('expandedRows'), new Set());
  const expandedSubGridsNode = graph.input<Set<string>>(nodeId('expandedSubGrids'), new Set());
  const pageNode = graph.input<number>(nodeId('page'), 0);
  const pageSizeNode = graph.input<number>(nodeId('pageSize'), config.pageSize ?? 50);
  const configNode = graph.input<GridConfig<TData>>(nodeId('config'), config);

  // Derived selectors — lazy, automatic dependency tracking, recomputed only
  // when an input they read actually changes.
  const processedDataNode = graph.derived<TData[]>(nodeId('processedData'), (get) => {
    let result = get(dataNode);
    result = applyFiltering(result as Record<string, unknown>[] as TData[], get(filterNode));
    result = applySorting(result as Record<string, unknown>[] as TData[], get(sortNode));
    return result;
  });
  const rowIdsNode = graph.derived<string[]>(nodeId('rowIds'), (get) =>
    get(dataNode).map((row) => resolveRowKey(row)),
  );
  const visibleColumnsNode = graph.derived<ColumnDef<TData>[]>(nodeId('visibleColumns'), (get) =>
    getVisibleColumns(get(columnsNode)) as ColumnDef<TData>[],
  );

  const nodes: GridNodes<TData> = {
    data: dataNode,
    columns: columnsNode,
    sort: sortNode,
    filter: filterNode,
    selection: selectionNode,
    editing: editingNode,
    undoRedo: undoRedoNode,
    groupState: groupStateNode,
    expandedRows: expandedRowsNode,
    expandedSubGrids: expandedSubGridsNode,
    page: pageNode,
    pageSize: pageSizeNode,
    config: configNode,
    processedData: processedDataNode,
    rowIds: rowIdsNode,
    visibleColumns: visibleColumnsNode,
  };

  function getState(): GridModelState<TData> {
    return {
      data: graph.read(dataNode),
      columns: graph.read(columnsNode),
      sort: graph.read(sortNode),
      filter: graph.read(filterNode),
      selection: graph.read(selectionNode),
      editing: graph.read(editingNode),
      undoRedo: graph.read(undoRedoNode),
      groupState: graph.read(groupStateNode),
      expandedRows: graph.read(expandedRowsNode),
      expandedSubGrids: graph.read(expandedSubGridsNode),
      page: graph.read(pageNode),
      pageSize: graph.read(pageSizeNode),
      config: graph.read(configNode),
    };
  }

  function getRowIds(): string[] {
    return graph.read(rowIdsNode);
  }

  const listeners = new Set<GridListener>();
  const eventBus = new EventBus();

  // Listener fan-out: one subscribeCommits, filtered to commits that touched
  // a node in this grid's namespace. External grid mutations (other grids on
  // the same graph, external derivation recomputes) do not fan to our
  // listeners. Also fires the umbrella `grid:dataChange` / `grid:stateChange`
  // EventBus events that pre-Phase-3 consumers (e.g. extensions) depend on.
  const nsPrefix = `${ns}:`;
  const dataNodeId = String(nodeId('data'));
  const secondaryStateNodeIds = new Set([
    String(nodeId('editing')),
    String(nodeId('groupState')),
    String(nodeId('expandedRows')),
    String(nodeId('expandedSubGrids')),
    String(nodeId('page')),
    String(nodeId('pageSize')),
  ]);
  const cleanupListenerBridge = graph.subscribeCommits((commit) => {
    const ids = commit.changedNodes.map((id) => String(id));
    const touchedThisGrid = ids.some((id) => id.startsWith(nsPrefix));
    if (!touchedThisGrid) return;
    for (const l of listeners) l();
    if (ids.includes(dataNodeId)) {
      eventBus.dispatch('grid:dataChange', { data: graph.read(dataNode) });
    }
    if (ids.some((id) => secondaryStateNodeIds.has(id))) {
      eventBus.dispatch('grid:stateChange', {});
    }
  });

  // Persistence write-back: when storage is supplied, mirror columnsNode
  // changes through the Set-aware encoder. Symmetric to the hydration read
  // above.
  const cleanupPersistence = storage
    ? graph.subscribe(columnsNode, (value) => {
        try {
          storage.set(columnsStorageKey, encodeColumnState(value));
        } catch {
          /* swallow — storage failures should not break the grid. */
        }
      })
    : (() => {
        /* no storage → nothing to clean up */
      });

  const commands: GridCommands = {
    // GridCommands.setCellValue is the framework-side erased shape
    // (`CellAddress` + `unknown`). The tightened generic surface on
    // `GridModel.setCellValue<F>` is preserved; this is the bridge.
    setCellValue: async (cell, value) =>
      model.setCellValue(
        cell as { rowId: string; field: Extract<keyof TData, string> },
        value as TData[Extract<keyof TData, string>],
      ),
    beginEdit: async (cell, cause) => model.beginEdit(cell, cause),
    commitEdit: async () => model.commitEdit(),
    cancelEdit: async () => model.cancelEdit(),
    insertRow: async (index, data) => model.insertRow(index, data),
    deleteRows: async (rowIds) => model.deleteRows(rowIds),
    setSelection: (range) => {
      if (range) model.select(range.anchor);
      else model.clearSelectionState();
    },
    scrollToCell: () => {},
    invalidateCells: () => { for (const l of listeners) l(); },
    invalidateAll: () => { for (const l of listeners) l(); },
    sort: (s) => model.sort(s),
    filter: (f) => model.filter(f),
    setColumnWidth: (field, width) => model.setColumnWidth(field, width),
    reorderColumn: (field, toIndex) => model.reorderColumnByField(field, toIndex),
    toggleColumnVisibility: (field) => model.toggleColumnVisible(field),
    freezeColumn: (field, frozen) => model.freezeColumnByField(field, frozen),
    undo: () => model.undo(),
    redo: () => model.redo(),
  };

  const pluginHost = new PluginHost(
    eventBus,
    () => {
      const s = getState();
      return {
        data: s.data as Record<string, unknown>[],
        columns: getVisibleColumns(s.columns) as ColumnDef[],
        sort: s.sort,
        filter: s.filter,
        selection: s.selection.range,
        editingCell: s.editing.cell,
        page: s.page,
        pageSize: s.pageSize,
        expandedRows: s.expandedRows,
        expandedSubGrids: s.expandedSubGrids,
        columnOrder: s.columns.order,
        columnWidths: s.columns.widths,
        hiddenColumns: s.columns.hidden,
        frozenColumns: s.columns.frozen,
        groupState: s.groupState,
        undoStack: s.undoRedo.undoStack,
        redoStack: s.undoRedo.redoStack,
      };
    },
    () => commands,
  );

  const model: GridModel<TData> = {
    graph,
    nodes,
    getState,
    getProcessedData: () => graph.read(processedDataNode),
    getRowIds,
    getVisibleColumns: () => graph.read(visibleColumnsNode),

    async setCellValue(cell: CellAddress, value: unknown) {
      const rowIds = getRowIds();
      const rowIndex = rowIds.indexOf(cell.rowId);
      if (rowIndex === -1) return;

      const data = graph.read(dataNode);
      const row = data[rowIndex];
      if (!row) return;
      const oldValue = row[cell.field as keyof TData];

      const beforeEvent = eventBus.dispatchBeforeSync('before:cell:valueChange', { cell, oldValue, newValue: value });
      if (beforeEvent.cancelled) return;

      const before = structuredClone(data);
      const after = structuredClone(data);
      after[rowIndex] = { ...after[rowIndex]!, [cell.field]: value } as TData;

      // Undo/redo closures re-enter the graph via separate commits — accepted
      // tradeoff: a user-level undo is two commits (data restore + bookkeeping).
      const cmd: Command = {
        type: 'cell:edit',
        timestamp: Date.now(),
        description: `Edit ${cell.field}`,
        undo: () => graph.commit('cell:edit:undo', (tx) => tx.set(dataNode, structuredClone(before))),
        redo: () => graph.commit('cell:edit:redo', (tx) => tx.set(dataNode, structuredClone(after))),
      };

      const undoStateBefore = graph.read(undoRedoNode);
      graph.commit('cell:setValue', (tx) => {
        tx.set(dataNode, after);
        tx.set(undoRedoNode, pushCommand(undoStateBefore, cmd));
      });

      await eventBus.dispatch('cell:valueChange', { cell, oldValue, newValue: value });
    },

    beginEdit(cell: CellAddress, cause: EditCause = 'programmatic') {
      const rowIds = getRowIds();
      const rowIndex = rowIds.indexOf(cell.rowId);
      if (rowIndex === -1) return;
      const row = graph.read(dataNode)[rowIndex];
      if (!row) return;
      const value = row[cell.field as keyof TData] as CellValue;
      const editingBefore = graph.read(editingNode);
      graph.commit('cell:beginEdit', (tx) =>
        tx.set(editingNode, beginEditState(editingBefore, cell, value, cause)),
      );
    },

    async commitEdit() {
      const editingBefore = graph.read(editingNode);
      const result = commitEditState(editingBefore);
      if (result) {
        // commitEditState surfaces { cell: CellAddress, value }; we widen
        // to the tightened generic shape that setCellValue requires.
        await model.setCellValue(
          result.cell as { rowId: string; field: Extract<keyof TData, string> },
          result.value as TData[Extract<keyof TData, string>],
        );
      }
      const editingAfterValueWrite = graph.read(editingNode);
      graph.commit('cell:commitEdit', (tx) =>
        tx.set(editingNode, cancelEditState(editingAfterValueWrite)),
      );
    },

    cancelEdit() {
      const editingBefore = graph.read(editingNode);
      graph.commit('cell:cancelEdit', (tx) =>
        tx.set(editingNode, cancelEditState(editingBefore)),
      );
    },

    async insertRow(index: number, data?: Record<string, unknown>) {
      const newRow = (data ?? {}) as TData;

      const beforeEvent = eventBus.dispatchBeforeSync('before:row:insert', { index, data: newRow });
      if (beforeEvent.cancelled) return;

      const currentData = graph.read(dataNode);
      const before = structuredClone(currentData);
      const after = structuredClone(currentData);
      after.splice(index, 0, newRow);

      const cmd: Command = {
        type: 'row:insert',
        timestamp: Date.now(),
        description: 'Insert row',
        undo: () => graph.commit('row:insert:undo', (tx) => tx.set(dataNode, structuredClone(before))),
        redo: () => graph.commit('row:insert:redo', (tx) => tx.set(dataNode, structuredClone(after))),
      };

      const undoStateBefore = graph.read(undoRedoNode);
      graph.commit('row:insert', (tx) => {
        tx.set(dataNode, after);
        tx.set(undoRedoNode, pushCommand(undoStateBefore, cmd));
      });

      await eventBus.dispatch('row:insert', { index, data: newRow });
    },

    async deleteRows(rowIds: string[]) {
      const allRowIds = getRowIds();
      const entries = rowIds
        .map((rowId) => ({ rowId, index: allRowIds.indexOf(rowId) }))
        .filter((e) => e.index !== -1)
        .sort((a, b) => b.index - a.index);

      if (entries.length === 0) return;

      const beforeEvent = eventBus.dispatchBeforeSync('before:row:delete', { rowIds });
      if (beforeEvent.cancelled) return;

      const currentData = graph.read(dataNode);
      const before = structuredClone(currentData);
      const after = structuredClone(currentData);
      for (const { index } of entries) {
        const originalRow = currentData[index] as TData;
        const clonedIndex = after.findIndex(
          (r) => JSON.stringify(r) === JSON.stringify(originalRow)
        );
        if (clonedIndex !== -1) after.splice(clonedIndex, 1);
      }

      const batchCmd: Command = {
        type: 'batch',
        timestamp: Date.now(),
        description: `Delete ${entries.length} row(s)`,
        undo: () => graph.commit('row:delete:undo', (tx) => tx.set(dataNode, structuredClone(before))),
        redo: () => graph.commit('row:delete:redo', (tx) => tx.set(dataNode, structuredClone(after))),
      };

      const undoStateBefore = graph.read(undoRedoNode);
      graph.commit('row:delete', (tx) => {
        tx.set(dataNode, after);
        tx.set(undoRedoNode, pushCommand(undoStateBefore, batchCmd));
      });

      await eventBus.dispatch('row:delete', { rowIds });
    },

    async moveRow(fromIndex: number, toIndex: number) {
      const beforeEvent = eventBus.dispatchBeforeSync('before:row:move', { fromIndex, toIndex });
      if (beforeEvent.cancelled) return;

      const currentData = graph.read(dataNode);
      const before = structuredClone(currentData);
      const after = structuredClone(before);
      const [row] = after.splice(fromIndex, 1);
      if (row) after.splice(toIndex, 0, row);

      const cmd: Command = {
        type: 'row:move',
        timestamp: Date.now(),
        description: `Move row from ${fromIndex} to ${toIndex}`,
        undo: () => graph.commit('row:move:undo', (tx) => tx.set(dataNode, structuredClone(before))),
        redo: () => graph.commit('row:move:redo', (tx) => tx.set(dataNode, structuredClone(after))),
      };

      const undoStateBefore = graph.read(undoRedoNode);
      graph.commit('row:move', (tx) => {
        tx.set(dataNode, after);
        tx.set(undoRedoNode, pushCommand(undoStateBefore, cmd));
      });

      await eventBus.dispatch('row:move', { fromIndex, toIndex });
    },

    toggleRowSelect(rowId: string) {
      const cols = getVisibleColumns(graph.read(columnsNode));
      const sel = graph.read(selectionNode);
      graph.commit('selection:toggleRow', (tx) =>
        tx.set(selectionNode, toggleRowSelection(sel, rowId, cols)),
      );
    },

    sort(sortState: SortState) {
      graph.commit('column:sort', (tx) => tx.set(sortNode, sortState));
      eventBus.dispatch('column:sort', { sort: sortState });
    },

    toggleColumnSort(field: string, multi: boolean) {
      const newSort = toggleSort(graph.read(sortNode), field, multi);
      model.sort(newSort);
    },

    filter(filterState: FilterState | null) {
      graph.commit('column:filter', (tx) => tx.set(filterNode, filterState));
      eventBus.dispatch('column:filter', { filter: filterState });
    },

    select(cell: CellAddress) {
      const sel = graph.read(selectionNode);
      graph.commit('cell:select', (tx) =>
        tx.set(selectionNode, selectCell(sel, cell)),
      );
      eventBus.dispatch('cell:selectionChange', { selection: graph.read(selectionNode).range });
    },

    selectRowByKey(rowId: string) {
      const cols = getVisibleColumns(graph.read(columnsNode));
      const sel = graph.read(selectionNode);
      graph.commit('row:select', (tx) =>
        tx.set(selectionNode, selectRow(sel, rowId, cols)),
      );
    },

    selectColumnByField(field: string) {
      const ids = getRowIds();
      const sel = graph.read(selectionNode);
      graph.commit('column:select', (tx) =>
        tx.set(selectionNode, selectColumn(sel, field, ids)),
      );
    },

    extendTo(cell: CellAddress) {
      const sel = graph.read(selectionNode);
      graph.commit('selection:extend', (tx) =>
        tx.set(selectionNode, extendSelection(sel, cell)),
      );
    },

    extendRowSelection(rowId: string) {
      const cols = getVisibleColumns(graph.read(columnsNode));
      const sel = graph.read(selectionNode);
      graph.commit('selection:extendRow', (tx) =>
        tx.set(selectionNode, extendRowSelection(sel, rowId, cols)),
      );
    },

    selectAllCells() {
      const cols = getVisibleColumns(graph.read(columnsNode)) as ColumnDef<TData>[];
      const ids = getRowIds();
      const sel = graph.read(selectionNode);
      graph.commit('selection:all', (tx) =>
        tx.set(selectionNode, selectAll(sel, cols as ColumnDef[], ids)),
      );
    },

    clearSelectionState() {
      const sel = graph.read(selectionNode);
      graph.commit('selection:clear', (tx) =>
        tx.set(selectionNode, clearSelection(sel)),
      );
    },

    setColumnWidth(field: string, width: number) {
      const colsBefore = graph.read(columnsNode);
      graph.commit('column:resize', (tx) =>
        tx.set(columnsNode, resizeColumn(colsBefore, field, width)),
      );
      eventBus.dispatch('column:resize', { field, width });
    },

    reorderColumnByField(field: string, toIndex: number) {
      const colsBefore = graph.read(columnsNode);
      graph.commit('column:reorder', (tx) =>
        tx.set(columnsNode, reorderColumn(colsBefore, field, toIndex)),
      );
      eventBus.dispatch('column:reorder', { field, toIndex });
    },

    toggleColumnVisible(field: string) {
      const colsBefore = graph.read(columnsNode);
      graph.commit('column:visibility', (tx) =>
        tx.set(columnsNode, toggleColumnVisibility(colsBefore, field)),
      );
      eventBus.dispatch('column:visibility', { field });
    },

    freezeColumnByField(field: string, position: 'left' | 'right' | null) {
      const colsBefore = graph.read(columnsNode);
      graph.commit('column:freeze', (tx) =>
        tx.set(columnsNode, freezeColumn(colsBefore, field, position)),
      );
    },

    toggleSubGridExpansion(rowId: string) {
      const currentSet = graph.read(expandedSubGridsNode);
      const next = new Set(currentSet);
      const singleExpand = graph.read(configNode).subGrid?.singleExpand ?? false;
      let collapsed = false;

      if (next.has(rowId)) {
        next.delete(rowId);
        collapsed = true;
      } else {
        if (singleExpand) next.clear();
        next.add(rowId);
      }
      graph.commit('subGrid:toggle', (tx) => tx.set(expandedSubGridsNode, next));
      eventBus.dispatch(collapsed ? 'subGrid:collapse' : 'subGrid:expand', { rowId });
    },

    undo() {
      // undoOp calls cmd.undo() internally, which issues its own commit;
      // we then commit the bookkeeping. Two commits per user-level undo.
      const newUndoRedo = undoOp(graph.read(undoRedoNode));
      graph.commit('undo:bookkeeping', (tx) => tx.set(undoRedoNode, newUndoRedo));
    },

    redo() {
      const newUndoRedo = redoOp(graph.read(undoRedoNode));
      graph.commit('redo:bookkeeping', (tx) => tx.set(undoRedoNode, newUndoRedo));
    },

    async registerExtension(ext: ExtensionDefinition) {
      await pluginHost.register(ext);
    },

    async unregisterExtension(id: string) {
      await pluginHost.unregister(id);
    },

    subscribe(listener: GridListener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },

    async dispatch(type: GridEventType, payload: Record<string, unknown> = {}) {
      return eventBus.dispatch(type, payload);
    },

    async destroy() {
      await pluginHost.dispose();
      cleanupListenerBridge();
      cleanupPersistence();
      eventBus.clear();
      listeners.clear();
    },
  };

  return model;
}
