/**
 * useGridInteraction — causl-backed React hook over the pure
 * gridInteractionReducer.
 *
 * Phase-2 (planned) / now-shipped lift: the menu / drag / resize /
 * column-overrides state that used to live in a local `useReducer`
 * now lives in a causl input node. The reducer itself is unchanged
 * (still the pure transition function); only the storage and
 * subscription substrate moved.
 *
 * Why: brings interaction state into the same `Graph` as the grid's
 * data state (per the BYO-graph contract). SPA-side consumers can
 * then register `graph.derived(...)` nodes that read from BOTH
 * data state AND interaction state and update atomically — e.g.
 * "is any grid menu open across the SPA?", or "drag is in
 * progress; pause my analytics overlay until it ends." Without
 * this lift, the interaction state was an island invisible to
 * the rest of the SPA's causl graph.
 *
 * BYO-graph: pass `{ graph }` to lift interaction state into your
 * SPA's graph. Without a graph argument, the hook constructs a
 * private graph (backcompat with the pre-lift signature).
 *
 * @module use-grid-interaction
 */
import { useCallback, useMemo, useRef, useSyncExternalStore } from 'react';
import { createCausl, type Graph, type InputNode } from '@iasbuilt/datagrid-core';
import {
  gridInteractionReducer,
  initialGridInteractionState,
  type GridInteractionState,
  type GridInteractionAction,
  type FilterMenuAnchor,
} from './grid-interaction-state';

/**
 * Configuration passed to {@link useGridInteraction}. All fields are
 * optional; the bare-call form `useGridInteraction()` runs against an
 * internally-constructed private graph and is the default for adopters
 * that don't need SPA-wide state composition.
 */
export interface UseGridInteractionOptions {
  /**
   * Optional causl graph the hook should register its state node on.
   * When supplied, interaction state lives alongside any other state
   * on the same graph — SPA consumers can compose derivations across
   * both. When omitted, the hook constructs a private graph.
   */
  graph?: Graph;
  /**
   * Namespace prefix for the interaction state node id. Defaults to
   * `'interaction'`. Use distinct namespaces when multiple grids
   * share one graph so their interaction states do not collide.
   */
  namespace?: string;
}

/**
 * Return shape of {@link useGridInteraction}.
 *
 * The reactive `state` is the read side; `dispatch` is the generic
 * write side; every other field is a pre-bound action creator that
 * dispatches a single typed action against the underlying reducer.
 *
 * The action creators are stable across renders (memoised against the
 * graph node), so consumers may include them in `useEffect`
 * dependency arrays without triggering re-runs on every dispatch.
 */
export interface UseGridInteractionReturn {
  state: GridInteractionState;
  dispatch: (action: GridInteractionAction) => void;
  openContextMenu: (x: number, y: number, rowId: string | null, field: string | null) => void;
  openColumnMenu: (field: string) => void;
  openColumnVisibilityMenu: () => void;
  closeMenu: () => void;
  startColumnDrag: (field: string) => void;
  updateColumnDragOver: (overField: string) => void;
  dropColumn: (currentOrder: string[]) => void;
  endColumnDrag: () => void;
  startColumnGroupDrag: (groupId: string) => void;
  updateColumnGroupDragOver: (overGroupId: string) => void;
  dropColumnGroup: (currentGroupOrder: string[]) => void;
  endColumnGroupDrag: () => void;
  setColumnWidth: (field: string, width: number) => void;
  hideColumn: (field: string) => void;
  showColumn: (field: string) => void;
  freezeColumn: (field: string, position: 'left' | 'right') => void;
  unfreezeColumn: (field: string) => void;
  toggleColumnGroupCollapse: (groupId: string) => void;
  setColumnOrder: (order: string[]) => void;
  // Row groups
  toggleRowGroup: (groupId: string) => void;
  setRowGroupExpanded: (expanded: Set<string>) => void;
  // Row drag session
  startRowDrag: (sourceRowId: string, sourceIndex: number) => void;
  endRowDrag: () => void;
  // Excel filter menu
  openFilterMenu: (field: string, anchor: FilterMenuAnchor) => void;
  closeFilterMenu: () => void;
  // Custom-filter condition dialog
  openConditionDialog: (field: string) => void;
  closeConditionDialog: () => void;
}

/**
 * React hook binding the pure {@link gridInteractionReducer} to a
 * causl input node so React components can read interaction state
 * through `useSyncExternalStore` while SPA-side derivations on the
 * same graph see the same atomic transitions.
 *
 * Behaviour:
 *
 *   1. On first render the hook resolves a graph: caller-supplied
 *      `options.graph` (BYO-graph composition) or a private graph
 *      created with `createCausl({ name: 'grid-interaction-<ns>' })`.
 *      The choice is memoised in a ref so subsequent renders never
 *      re-bind state to a different graph mid-flight.
 *   2. It registers a single input node at `<namespace>:state`
 *      (default namespace `'interaction'`) carrying the full
 *      {@link GridInteractionState}. Multiple grids on the same
 *      graph must pass distinct namespaces to avoid collisions.
 *   3. Every dispatch runs `graph.commit('interaction:<action.type>',
 *      tx => tx.set(node, reducer(prev, action)))`, so observers see
 *      exactly one new state per action.
 *
 * The hook is safe to call without `options` — the default arguments
 * preserve the pre-Phase-3 behaviour of an isolated, ephemeral
 * interaction state.
 */
export function useGridInteraction(
  options: UseGridInteractionOptions = {},
): UseGridInteractionReturn {
  // Memoize the graph + node ONCE per component lifetime. The hook does
  // not react to a changing `graph` prop — that would be a SPA-wide
  // remount of the host anyway, and re-binding state to a new graph
  // mid-flight has no sensible semantics.
  const setupRef = useRef<{ graph: Graph; node: InputNode<GridInteractionState> } | null>(null);
  if (setupRef.current === null) {
    const ns = options.namespace ?? 'interaction';
    const graph = options.graph ?? createCausl({ name: `grid-interaction-${ns}` });
    const node = graph.input<GridInteractionState>(`${ns}:state`, initialGridInteractionState);
    setupRef.current = { graph, node };
  }
  const { graph, node } = setupRef.current;

  // Read via useSyncExternalStore — tear-free under concurrent rendering.
  const state = useSyncExternalStore(
    useCallback((cb) => graph.subscribe(node, cb), [graph, node]),
    useCallback(() => graph.read(node), [graph, node]),
  );

  const dispatch = useCallback(
    (action: GridInteractionAction) => {
      const before = graph.read(node);
      const after = gridInteractionReducer(before, action);
      // Reducer no-op (returned the same reference) → skip the commit
      // entirely. Saves a graph tick + a useSyncExternalStore re-fire.
      if (after === before) return;
      graph.commit(`interaction:${action.type}`, (tx) => tx.set(node, after));
    },
    [graph, node],
  );

  // All convenience helpers — stable per the existing contract.
  const openContextMenu = useCallback(
    (x: number, y: number, rowId: string | null, field: string | null) => {
      dispatch({ type: 'open-context-menu', x, y, rowId, field });
    },
    [dispatch],
  );
  const openColumnMenu = useCallback(
    (field: string) => dispatch({ type: 'open-column-menu', field }),
    [dispatch],
  );
  const openColumnVisibilityMenu = useCallback(
    () => dispatch({ type: 'open-column-visibility-menu' }),
    [dispatch],
  );
  const closeMenu = useCallback(() => dispatch({ type: 'close-menu' }), [dispatch]);
  const startColumnDrag = useCallback(
    (field: string) => dispatch({ type: 'start-column-drag', field }),
    [dispatch],
  );
  const updateColumnDragOver = useCallback(
    (overField: string) => dispatch({ type: 'update-column-drag-over', overField }),
    [dispatch],
  );
  const dropColumn = useCallback(
    (currentOrder: string[]) => dispatch({ type: 'drop-column', currentOrder }),
    [dispatch],
  );
  const endColumnDrag = useCallback(() => dispatch({ type: 'end-column-drag' }), [dispatch]);
  const startColumnGroupDrag = useCallback(
    (groupId: string) => dispatch({ type: 'start-column-group-drag', groupId }),
    [dispatch],
  );
  const updateColumnGroupDragOver = useCallback(
    (overGroupId: string) =>
      dispatch({ type: 'update-column-group-drag-over', overGroupId }),
    [dispatch],
  );
  const dropColumnGroup = useCallback(
    (currentGroupOrder: string[]) =>
      dispatch({ type: 'drop-column-group', currentGroupOrder }),
    [dispatch],
  );
  const endColumnGroupDrag = useCallback(
    () => dispatch({ type: 'end-column-group-drag' }),
    [dispatch],
  );
  const setColumnWidth = useCallback(
    (field: string, width: number) => dispatch({ type: 'set-column-width', field, width }),
    [dispatch],
  );
  const hideColumn = useCallback(
    (field: string) => dispatch({ type: 'hide-column', field }),
    [dispatch],
  );
  const showColumn = useCallback(
    (field: string) => dispatch({ type: 'show-column', field }),
    [dispatch],
  );
  const freezeColumn = useCallback(
    (field: string, position: 'left' | 'right') =>
      dispatch({ type: 'freeze-column', field, position }),
    [dispatch],
  );
  const unfreezeColumn = useCallback(
    (field: string) => dispatch({ type: 'unfreeze-column', field }),
    [dispatch],
  );
  const toggleColumnGroupCollapse = useCallback(
    (groupId: string) => dispatch({ type: 'toggle-column-group-collapse', groupId }),
    [dispatch],
  );
  const setColumnOrder = useCallback(
    (order: string[]) => dispatch({ type: 'set-column-order', order }),
    [dispatch],
  );
  const toggleRowGroup = useCallback(
    (groupId: string) => dispatch({ type: 'toggle-row-group', groupId }),
    [dispatch],
  );
  const setRowGroupExpanded = useCallback(
    (expanded: Set<string>) => dispatch({ type: 'set-row-group-expanded', expanded }),
    [dispatch],
  );
  const startRowDrag = useCallback(
    (sourceRowId: string, sourceIndex: number) =>
      dispatch({ type: 'start-row-drag', sourceRowId, sourceIndex }),
    [dispatch],
  );
  const endRowDrag = useCallback(() => dispatch({ type: 'end-row-drag' }), [dispatch]);
  const openFilterMenu = useCallback(
    (field: string, anchor: FilterMenuAnchor) =>
      dispatch({ type: 'open-filter-menu', field, anchor }),
    [dispatch],
  );
  const closeFilterMenu = useCallback(
    () => dispatch({ type: 'close-filter-menu' }),
    [dispatch],
  );
  const openConditionDialog = useCallback(
    (field: string) => dispatch({ type: 'open-condition-dialog', field }),
    [dispatch],
  );
  const closeConditionDialog = useCallback(
    () => dispatch({ type: 'close-condition-dialog' }),
    [dispatch],
  );

  return useMemo(
    () => ({
      state,
      dispatch,
      openContextMenu,
      openColumnMenu,
      openColumnVisibilityMenu,
      closeMenu,
      startColumnDrag,
      updateColumnDragOver,
      dropColumn,
      endColumnDrag,
      startColumnGroupDrag,
      updateColumnGroupDragOver,
      dropColumnGroup,
      endColumnGroupDrag,
      setColumnWidth,
      hideColumn,
      showColumn,
      freezeColumn,
      unfreezeColumn,
      toggleColumnGroupCollapse,
      setColumnOrder,
      toggleRowGroup,
      setRowGroupExpanded,
      startRowDrag,
      endRowDrag,
      openFilterMenu,
      closeFilterMenu,
      openConditionDialog,
      closeConditionDialog,
    }),
    [
      state,
      dispatch,
      openContextMenu,
      openColumnMenu,
      openColumnVisibilityMenu,
      closeMenu,
      startColumnDrag,
      updateColumnDragOver,
      dropColumn,
      endColumnDrag,
      startColumnGroupDrag,
      updateColumnGroupDragOver,
      dropColumnGroup,
      endColumnGroupDrag,
      setColumnWidth,
      hideColumn,
      showColumn,
      freezeColumn,
      unfreezeColumn,
      toggleColumnGroupCollapse,
      setColumnOrder,
      toggleRowGroup,
      setRowGroupExpanded,
      startRowDrag,
      endRowDrag,
      openFilterMenu,
      closeFilterMenu,
      openConditionDialog,
      closeConditionDialog,
    ],
  );
}
