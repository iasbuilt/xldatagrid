/**
 * Atomic grid model factory module.
 *
 * Wraps a Jotai atom store behind the {@link GridModel} interface, providing
 * backward-compatible imperative access while enabling granular reactive
 * subscriptions through the underlying atom system. The factory produces an
 * {@link AtomicGridBundle} that bundles the model facade, the raw Jotai store,
 * and the atom system so consumers can choose their preferred level of
 * abstraction.
 *
 * @module atomic-grid-model
 */
import { createStore } from 'jotai/vanilla';
import type {
  GridConfig,
  GridState,
  GridEvent,
  GridEventType,
  GridCommands,
  GridListener,
  RowKeyResolver,
  CellAddress,
  CellRange,
  SortState,
  FilterState,
  ColumnDef,
  ExtensionDefinition,
} from '@iasbuilt/datagrid-core';
import { EventBus, PluginHost, getVisibleColumns, toggleRowSelection, createRowMoveCommand, pushCommand } from '@iasbuilt/datagrid-core';
import { createGridAtomSystem, type GridAtomSystem } from './atoms';
import { createEventBridge } from './atoms/event-bridge';
import type { GridModel, GridModelState } from '@iasbuilt/datagrid-core';

/**
 * Type alias for the Jotai vanilla store instance returned by `createStore`.
 *
 * Exposed so that consumers who interact with atoms directly can type their
 * store references without importing Jotai internals.
 */
export type AtomicStore = ReturnType<typeof createStore>;

/**
 * The complete bundle returned by {@link createAtomicGridModel}.
 *
 * Provides three layers of access to the same underlying state:
 * - `model` -- imperative {@link GridModel} facade (backward-compatible API).
 * - `store` -- raw Jotai store for direct atom reads/writes.
 * - `atoms` -- the full atom system for granular React subscriptions.
 *
 * @typeParam TData - Row data shape; must be a string-keyed record.
 */
export interface AtomicGridBundle<TData extends Record<string, unknown>> {
  model: GridModel<TData>;
  store: AtomicStore;
  atoms: GridAtomSystem<TData>;
}

/**
 * Creates an {@link AtomicGridBundle} that backs a {@link GridModel} with Jotai atoms.
 *
 * The function stands up the full runtime for a single datagrid instance:
 * a Jotai store, the atom system derived from the provided configuration,
 * an event bus bridging atom mutations to extension hooks, and a plugin host
 * for registering/unregistering extensions.
 *
 * Listeners attached via `model.subscribe` are notified whenever *any* base
 * atom changes, preserving compatibility with `useSyncExternalStore`-style
 * consumers that expect a single notification channel.
 *
 * @typeParam TData - Row data shape; must be a string-keyed record.
 *
 * @param config - Grid configuration including column definitions, initial
 *   data, row-key resolution strategy, and optional extension definitions.
 *
 * @returns An {@link AtomicGridBundle} containing the model facade, Jotai
 *   store, and atom system.
 *
 * @example
 * ```ts
 * const { model, store, atoms } = createAtomicGridModel({
 *   columns: [{ field: 'name', headerName: 'Name' }],
 *   data: [{ name: 'Alice' }],
 *   rowKey: 'id',
 * });
 * ```
 */
export function createAtomicGridModel<TData extends Record<string, unknown>>(
  config: GridConfig<TData>,
): AtomicGridBundle<TData> {
  // Normalise the rowKey option: if the caller passed a string property name,
  // wrap it into a resolver function that reads that property and stringifies it.
  const resolveRowKey: RowKeyResolver<TData> =
    typeof config.rowKey === 'function'
      ? config.rowKey
      : (row: TData) => String(row[config.rowKey as keyof TData]);

  // Initialise the core infrastructure: event bus for cross-cutting concerns,
  // a dedicated Jotai store (isolated from any global provider), and the full
  // atom system seeded from the grid configuration.
  const eventBus = new EventBus();
  const store = createStore();
  const atoms = createGridAtomSystem(config, resolveRowKey, eventBus);

  // Set up event bridge: atom changes → EventBus events for extensions
  const cleanupBridge = createEventBridge(store, eventBus, atoms.base);

  /**
   * Assembles a snapshot of the current grid state by reading every relevant
   * base atom. The snapshot conforms to the {@link GridState} shape expected
   * by the plugin host when it supplies context to extensions.
   *
   * @returns A plain-object snapshot of the grid state.
   */
  function getGridState(): GridState {
    // Read each base atom individually to produce a single cohesive snapshot.
    const data = store.get(atoms.base.dataAtom);
    const columns = store.get(atoms.base.columnsAtom);
    const sort = store.get(atoms.base.sortAtom);
    const filter = store.get(atoms.base.filterAtom);
    const selection = store.get(atoms.base.selectionAtom);
    const editing = store.get(atoms.base.editingAtom);
    const undoRedo = store.get(atoms.base.undoRedoAtom);
    const groupState = store.get(atoms.base.groupStateAtom);
    const expandedRows = store.get(atoms.base.expandedRowsAtom);
    const expandedSubGrids = store.get(atoms.base.expandedSubGridsAtom);
    const page = store.get(atoms.base.pageAtom);
    const pageSize = store.get(atoms.base.pageSizeAtom);

    return {
      data: data as Record<string, unknown>[],
      columns: getVisibleColumns(columns) as ColumnDef[],
      sort,
      filter,
      selection: selection.range,
      editingCell: editing.cell,
      page,
      pageSize,
      expandedRows,
      expandedSubGrids,
      columnOrder: columns.order,
      columnWidths: columns.widths,
      hiddenColumns: columns.hidden,
      frozenColumns: columns.frozen,
      groupState,
      undoStack: undoRedo.undoStack,
      redoStack: undoRedo.redoStack,
    };
  }

  // Build the GridCommands adapter that translates imperative command calls
  // into Jotai action-atom writes, giving extensions a stable command surface.
  const commands: GridCommands = {
    setCellValue: async (cell: CellAddress, value: unknown) => store.set(atoms.actions.setCellValueAtom, cell, value),
    beginEdit: async (cell: CellAddress) => store.set(atoms.actions.beginEditAtom, cell),
    commitEdit: async () => store.set(atoms.actions.commitEditAtom),
    cancelEdit: async () => store.set(atoms.actions.cancelEditAtom),
    insertRow: async (index: number, data?: Record<string, unknown>) => store.set(atoms.actions.insertRowAtom, index, data),
    deleteRows: async (rowIds: string[]) => store.set(atoms.actions.deleteRowsAtom, rowIds),
    setSelection: (range: CellRange | null) => {
      if (range) store.set(atoms.actions.selectCellAtom, range.anchor);
      else store.set(atoms.actions.clearSelectionAtom);
    },
    scrollToCell: () => {},
    invalidateCells: () => {},
    invalidateAll: () => {},
    sort: (s: SortState) => store.set(atoms.actions.sortActionAtom, s),
    filter: (f: FilterState | null) => store.set(atoms.actions.filterActionAtom, f),
    setColumnWidth: (field: string, width: number) => store.set(atoms.actions.setColumnWidthAtom, field, width),
    reorderColumn: (field: string, toIndex: number) => store.set(atoms.actions.reorderColumnAtom, field, toIndex),
    toggleColumnVisibility: (field: string) => store.set(atoms.actions.toggleColumnVisibleAtom, field),
    freezeColumn: (field: string, frozen: 'left' | 'right' | null) => store.set(atoms.actions.freezeColumnAtom, field, frozen),
    undo: () => store.set(atoms.actions.undoAtom),
    redo: () => store.set(atoms.actions.redoAtom),
  };

  // Instantiate the plugin host, providing it the event bus, the state
  // snapshot function, and a thunk for the command interface.
  const pluginHost = new PluginHost(eventBus, getGridState, () => commands);

  // Composite subscription: subscribe to all base atoms so any change notifies listeners.
  // This preserves backward compat with useSyncExternalStore consumers that
  // expect a single "something changed" callback rather than per-atom granularity.
  const listeners = new Set<GridListener>();

  /**
   * Subscribes to every base atom in the atom system. When any atom value
   * changes, all registered {@link GridListener} callbacks are invoked.
   *
   * @returns A teardown function that removes all atom subscriptions.
   */
  function subscribeToAllAtoms() {
    const atomKeys = Object.keys(atoms.base) as (keyof typeof atoms.base)[];
    const unsubs: (() => void)[] = [];
    for (const key of atomKeys) {
      const a = atoms.base[key];
      // For each base atom, register a Jotai subscription that fans out
      // the change notification to every external listener.
      unsubs.push(store.sub(a, () => {
        for (const l of listeners) l();
      }));
    }
    return () => unsubs.forEach(u => u());
  }
  const cleanupAtomSubs = subscribeToAllAtoms();

  // Assemble the GridModel facade. Every method delegates to the appropriate
  // Jotai action atom or derived atom, keeping all real state inside the store.
  const model: GridModel<TData> = {
    /** {@inheritDoc GridModel.getState} */
    getState(): GridModelState<TData> {
      return {
        data: store.get(atoms.base.dataAtom),
        columns: store.get(atoms.base.columnsAtom),
        sort: store.get(atoms.base.sortAtom),
        filter: store.get(atoms.base.filterAtom),
        selection: store.get(atoms.base.selectionAtom),
        editing: store.get(atoms.base.editingAtom),
        undoRedo: store.get(atoms.base.undoRedoAtom),
        groupState: store.get(atoms.base.groupStateAtom),
        expandedRows: store.get(atoms.base.expandedRowsAtom),
        expandedSubGrids: store.get(atoms.base.expandedSubGridsAtom),
        page: store.get(atoms.base.pageAtom),
        pageSize: store.get(atoms.base.pageSizeAtom),
        config: store.get(atoms.base.configAtom),
      };
    },

    /** {@inheritDoc GridModel.getProcessedData} */
    getProcessedData(): TData[] {
      return store.get(atoms.derived.processedDataAtom);
    },

    /** {@inheritDoc GridModel.getRowIds} */
    getRowIds(): string[] {
      return store.get(atoms.derived.rowIdsAtom);
    },

    /** {@inheritDoc GridModel.getVisibleColumns} */
    getVisibleColumns(): ColumnDef<TData>[] {
      return store.get(atoms.derived.visibleColumnsAtom);
    },

    // Mutations — delegate to action atoms
    /** {@inheritDoc GridModel.setCellValue} */
    async setCellValue(cell: CellAddress, value: unknown) {
      store.set(atoms.actions.setCellValueAtom, cell, value);
    },

    /** {@inheritDoc GridModel.beginEdit} */
    beginEdit(cell: CellAddress) {
      store.set(atoms.actions.beginEditAtom, cell);
    },

    /** {@inheritDoc GridModel.commitEdit} */
    async commitEdit() {
      store.set(atoms.actions.commitEditAtom);
    },

    /** {@inheritDoc GridModel.cancelEdit} */
    cancelEdit() {
      store.set(atoms.actions.cancelEditAtom);
    },

    /** {@inheritDoc GridModel.insertRow} */
    async insertRow(index: number, data?: Record<string, unknown>) {
      store.set(atoms.actions.insertRowAtom, index, data);
    },

    /** {@inheritDoc GridModel.deleteRows} */
    async deleteRows(rowIds: string[]) {
      store.set(atoms.actions.deleteRowsAtom, rowIds);
    },

    async moveRow(fromIndex: number, toIndex: number) {
      const data = store.get(atoms.base.dataAtom) as TData[];
      const cmd = createRowMoveCommand(data, fromIndex, toIndex);
      cmd.redo();
      store.set(atoms.base.dataAtom, [...data]);
      const undoRedo = store.get(atoms.base.undoRedoAtom);
      store.set(atoms.base.undoRedoAtom, pushCommand(undoRedo, cmd));
      eventBus.dispatch('row:move', { fromIndex, toIndex });
    },

    toggleRowSelect(rowId: string) {
      const columns = getVisibleColumns(store.get(atoms.base.columnsAtom)) as ColumnDef[];
      const selection = store.get(atoms.base.selectionAtom);
      store.set(atoms.base.selectionAtom, toggleRowSelection(selection, rowId, columns));
    },

    /** {@inheritDoc GridModel.sort} */
    sort(sortState: SortState) {
      store.set(atoms.actions.sortActionAtom, sortState);
    },

    /** {@inheritDoc GridModel.toggleColumnSort} */
    toggleColumnSort(field: string, multi: boolean) {
      store.set(atoms.actions.toggleColumnSortAtom, field, multi);
    },

    /** {@inheritDoc GridModel.filter} */
    filter(filterState: FilterState | null) {
      store.set(atoms.actions.filterActionAtom, filterState);
    },

    /** {@inheritDoc GridModel.select} */
    select(cell: CellAddress) {
      store.set(atoms.actions.selectCellAtom, cell);
    },

    /** {@inheritDoc GridModel.selectRowByKey} */
    selectRowByKey(rowId: string) {
      store.set(atoms.actions.selectRowAtom, rowId);
    },

    /** {@inheritDoc GridModel.selectColumnByField} */
    selectColumnByField(field: string) {
      store.set(atoms.actions.selectColumnAtom, field);
    },

    /** {@inheritDoc GridModel.extendTo} */
    extendTo(cell: CellAddress) {
      store.set(atoms.actions.extendSelectionAtom, cell);
    },

    /** {@inheritDoc GridModel.extendRowSelection} */
    extendRowSelection(rowId: string) {
      store.set(atoms.actions.extendRowSelectionAtom, rowId);
    },

    /** {@inheritDoc GridModel.selectAllCells} */
    selectAllCells() {
      store.set(atoms.actions.selectAllAtom);
    },

    /** {@inheritDoc GridModel.clearSelectionState} */
    clearSelectionState() {
      store.set(atoms.actions.clearSelectionAtom);
    },

    /** {@inheritDoc GridModel.setColumnWidth} */
    setColumnWidth(field: string, width: number) {
      store.set(atoms.actions.setColumnWidthAtom, field, width);
    },

    /** {@inheritDoc GridModel.reorderColumnByField} */
    reorderColumnByField(field: string, toIndex: number) {
      store.set(atoms.actions.reorderColumnAtom, field, toIndex);
    },

    /** {@inheritDoc GridModel.toggleColumnVisible} */
    toggleColumnVisible(field: string) {
      store.set(atoms.actions.toggleColumnVisibleAtom, field);
    },

    /** {@inheritDoc GridModel.freezeColumnByField} */
    freezeColumnByField(field: string, position: 'left' | 'right' | null) {
      store.set(atoms.actions.freezeColumnAtom, field, position);
    },

    /** {@inheritDoc GridModel.undo} */
    undo() {
      store.set(atoms.actions.undoAtom);
    },

    /** {@inheritDoc GridModel.redo} */
    redo() {
      store.set(atoms.actions.redoAtom);
    },

    /** {@inheritDoc GridModel.toggleSubGridExpansion} */
    toggleSubGridExpansion(rowId: string) {
      const current = store.get(atoms.base.expandedSubGridsAtom);
      const next = new Set(current);
      const config = store.get(atoms.base.configAtom);
      if (next.has(rowId)) {
        next.delete(rowId);
        eventBus.dispatch('subGrid:collapse', { rowId });
      } else {
        if (config.subGrid?.singleExpand) {
          next.clear();
        }
        next.add(rowId);
        eventBus.dispatch('subGrid:expand', { rowId });
      }
      store.set(atoms.base.expandedSubGridsAtom, next);
    },

    /** {@inheritDoc GridModel.registerExtension} */
    async registerExtension(ext: ExtensionDefinition) {
      await pluginHost.register(ext);
    },

    /** {@inheritDoc GridModel.unregisterExtension} */
    async unregisterExtension(id: string) {
      await pluginHost.unregister(id);
    },

    /** {@inheritDoc GridModel.subscribe} */
    subscribe(listener: GridListener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },

    /** {@inheritDoc GridModel.dispatch} */
    async dispatch(type: GridEventType, payload: Record<string, unknown> = {}): Promise<GridEvent> {
      return eventBus.dispatch(type, payload);
    },

    /**
     * Tears down the entire grid runtime by disposing extensions, removing
     * the event bridge and atom subscriptions, clearing the event bus, and
     * dropping all external listeners.
     */
    async destroy() {
      await pluginHost.dispose();
      cleanupBridge();
      cleanupAtomSubs();
      eventBus.clear();
      listeners.clear();
    },
  };

  return { model, store, atoms };
}
