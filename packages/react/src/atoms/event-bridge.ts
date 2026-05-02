/**
 * Bridges Jotai atom subscriptions to the core {@link EventBus}, enabling
 * extensions and plugins that were designed around the event-driven API to
 * react to state changes that originate from atom writes.
 *
 * The bridge subscribes to each base atom listed in {@link ATOM_EVENT_MAP}
 * via `store.sub()`. Whenever an atom's value changes, the corresponding
 * {@link GridEventType} is dispatched on the EventBus with the new value
 * nested under a domain-specific payload key.
 *
 * @module event-bridge
 */
import type { createStore, Atom } from 'jotai/vanilla';
import type { GridEventType, EventBus } from '@iasbuilt/datagrid-core';
import type { BaseAtoms } from './base-atoms';

/**
 * Jotai store instance type, inferred from the `createStore` factory.
 */
type Store = ReturnType<typeof createStore>;

/**
 * Declarative mapping from a base atom key to the event type and payload
 * property name that should be dispatched when that atom changes.
 */
interface AtomEventMapping {
  /** Key into {@link BaseAtoms} identifying the source atom. */
  atomKey: keyof BaseAtoms;
  /** The {@link GridEventType} to dispatch on the EventBus. */
  event: GridEventType;
  /** Property name under which the atom's new value is placed in the event payload. */
  payloadKey: string;
}

/**
 * Static registry of atom-to-event mappings. Each entry causes
 * {@link createEventBridge} to install one `store.sub()` listener.
 *
 * @remarks
 * Several atoms (editing, groupState, expandedRows, expandedSubGrids, page,
 * pageSize) map to the generic `grid:stateChange` event because they represent
 * secondary state changes that do not have dedicated event types in the core.
 */
const ATOM_EVENT_MAP: AtomEventMapping[] = [
  { atomKey: 'sortAtom', event: 'column:sort', payloadKey: 'sort' },
  { atomKey: 'filterAtom', event: 'column:filter', payloadKey: 'filter' },
  { atomKey: 'selectionAtom', event: 'cell:selectionChange', payloadKey: 'selection' },
  { atomKey: 'dataAtom', event: 'grid:dataChange', payloadKey: 'data' },
  { atomKey: 'columnsAtom', event: 'column:resize', payloadKey: 'columns' },
  { atomKey: 'editingAtom', event: 'grid:stateChange', payloadKey: 'editing' },
  { atomKey: 'groupStateAtom', event: 'grid:stateChange', payloadKey: 'groupState' },
  { atomKey: 'expandedRowsAtom', event: 'grid:stateChange', payloadKey: 'expandedRows' },
  { atomKey: 'expandedSubGridsAtom', event: 'grid:stateChange', payloadKey: 'expandedSubGrids' },
  { atomKey: 'pageAtom', event: 'grid:stateChange', payloadKey: 'page' },
  { atomKey: 'pageSizeAtom', event: 'grid:stateChange', payloadKey: 'pageSize' },
];

/**
 * Subscribe to every mapped base atom and forward value changes to the
 * {@link EventBus} as typed grid events.
 *
 * The bridge is intentionally one-directional (atoms --> EventBus). Events
 * dispatched by action atoms directly are not duplicated here; only raw atom
 * value changes that lack an explicit `eventBus.dispatch` call in an action
 * atom trigger bridge dispatches.
 *
 * @typeParam TData - Row data type for the grid. Defaults to a generic record.
 * @param store - The Jotai store instance that owns the atoms.
 * @param eventBus - The core EventBus to dispatch events onto.
 * @param baseAtoms - The primitive atom bundle to observe.
 * @returns A cleanup function that unsubscribes all listeners installed by
 *   this bridge. Call it during component unmount or grid teardown.
 *
 * @example
 * ```ts
 * const teardown = createEventBridge(store, eventBus, baseAtoms);
 * // later, during cleanup:
 * teardown();
 * ```
 */
export function createEventBridge<TData = Record<string, unknown>>(
  store: Store,
  eventBus: EventBus,
  baseAtoms: BaseAtoms<TData>,
): () => void {
  // Accumulate unsubscribe handles so teardown can remove all listeners
  // in a single pass.
  const unsubscribes: (() => void)[] = [];

  for (const mapping of ATOM_EVENT_MAP) {
    // Resolve the concrete atom instance from the mapping's key.
    const atomInstance = baseAtoms[mapping.atomKey] as Atom<unknown>;

    // Subscribe to the atom; on each change, read the new value and
    // dispatch the corresponding event with the configured payload key.
    const unsub = store.sub(atomInstance, () => {
      const value = store.get(atomInstance);
      eventBus.dispatch(mapping.event, { [mapping.payloadKey]: value });
    });
    unsubscribes.push(unsub);
  }

  // Return a single teardown function that removes every subscription.
  return () => {
    for (const unsub of unsubscribes) {
      unsub();
    }
  };
}
