/**
 * Public barrel module for the Jotai atom-based state management layer.
 *
 * Re-exports the three atom tiers -- base (primitive/writable), derived
 * (read-only cached projections), and action (write-only mutations) -- along
 * with the {@link createEventBridge} function and the convenience
 * {@link createGridAtomSystem} factory that assembles all three tiers into a
 * single {@link GridAtomSystem} object.
 *
 * @module atoms
 */
import type { GridConfig, RowKeyResolver, EventBus } from '@iasbuilt/datagrid-core';
import { createGridAtoms, type BaseAtoms } from './base-atoms';
import { createDerivedAtoms, type DerivedAtoms } from './derived-atoms';
import { createActionAtoms, type ActionAtoms } from './action-atoms';
import { createEventBridge } from './event-bridge';

export type { BaseAtoms } from './base-atoms';
export type { DerivedAtoms } from './derived-atoms';
export type { ActionAtoms } from './action-atoms';
export { createGridAtoms } from './base-atoms';
export { createDerivedAtoms } from './derived-atoms';
export { createActionAtoms } from './action-atoms';
export { createEventBridge } from './event-bridge';

/**
 * Unified container grouping the three atom tiers for a single grid instance.
 *
 * Consumers typically destructure this into `{ base, derived, actions }` and
 * pass the individual bundles to hooks or components that only need a subset.
 *
 * @typeParam TData - Row data type for the grid. Defaults to a generic record.
 */
export interface GridAtomSystem<TData = Record<string, unknown>> {
  /** Primitive writable atoms holding ground-truth state. */
  base: BaseAtoms<TData>;
  /** Read-only atoms computing cached projections from base state. */
  derived: DerivedAtoms<TData>;
  /** Write-only atoms encapsulating every supported grid mutation. */
  actions: ActionAtoms<TData>;
}

/**
 * One-call factory that creates the complete Jotai atom system for a grid
 * instance by wiring together base, derived, and action atoms.
 *
 * When no {@link EventBus} is supplied, a no-op stub is used internally so
 * action atoms can call `eventBus.dispatch` unconditionally without null
 * checks.
 *
 * @typeParam TData - Row data type constrained to a string-keyed record.
 * @param config - Grid configuration providing initial data, columns, and
 *   feature settings.
 * @param resolveRowKey - Callback that extracts a stable unique key from a
 *   row object.
 * @param eventBus - Optional core EventBus for broadcasting state changes
 *   to the extension/plugin system. A silent stub is used when omitted.
 * @returns A {@link GridAtomSystem} containing base, derived, and action atom
 *   bundles.
 *
 * @example
 * ```ts
 * const system = createGridAtomSystem(config, (row) => row.id, eventBus);
 * store.set(system.actions.setCellValueAtom, addr, 'new value');
 * const rows = store.get(system.derived.processedDataAtom);
 * ```
 */
export function createGridAtomSystem<TData extends Record<string, unknown>>(
  config: GridConfig<TData>,
  resolveRowKey: RowKeyResolver<TData>,
  eventBus?: EventBus,
): GridAtomSystem<TData> {
  // Initialise the primitive atom layer from the grid configuration.
  const base = createGridAtoms(config, resolveRowKey);

  // Build read-only projections that subscribe to the base atoms.
  const derived = createDerivedAtoms(base, resolveRowKey);

  // Use a no-op EventBus stub if none provided so action atoms can call
  // dispatch() without guarding against undefined.
  const bus = eventBus ?? ({
    dispatch: () => Promise.resolve({
      type: 'grid:stateChange' as const,
      timestamp: 0,
      payload: {},
    }),
    addHook: () => () => {},
    subscribe: () => () => {},
    clear: () => {},
  } as unknown as EventBus);

  // Wire up write-only action atoms that coordinate base atoms, undo/redo,
  // and event dispatch.
  const actions = createActionAtoms(base, derived, bus, resolveRowKey);

  return { base, derived, actions };
}
