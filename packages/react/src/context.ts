/**
 * React context and accessor hooks for the datagrid's runtime dependencies.
 *
 * The {@link GridContext} carries three values -- the core `GridModel`, the
 * atomic store backing fine-grained subscriptions, and the atom system that
 * maps model slices to reactive atoms. Two convenience hooks
 * ({@link useGridContext} and {@link useGridAtomContext}) let descendant
 * components consume either the model alone (backward-compatible) or the
 * full context bundle.
 *
 * @module context
 */
import { createContext, useContext } from 'react';
import type { GridModel } from '@iasbuilt/datagrid-core';
import type { AtomicStore } from './atomic-grid-model';
import type { GridAtomSystem } from './atoms';

/**
 * Shape of the value carried by {@link GridContext}.
 *
 * Bundles the imperative `GridModel`, the atomic store that powers
 * fine-grained React subscriptions, and the atom system that exposes
 * individual model slices as reactive atoms.
 *
 * @typeParam TData - Row data shape; defaults to a generic record.
 */
export interface GridContextValue<TData = Record<string, unknown>> {
  /** Core imperative grid model from `@iasbuilt/datagrid-core`. */
  model: GridModel<TData>;
  /** Atomic store backing fine-grained React subscriptions. */
  store: AtomicStore;
  /** Atom system mapping model slices to reactive atoms. */
  atoms: GridAtomSystem<TData>;
}

/**
 * React context that the `DataGrid` component provides to all descendants.
 *
 * Defaults to `null`; consuming hooks throw if used outside a `DataGrid`.
 */
export const GridContext = createContext<GridContextValue | null>(null);

/**
 * Retrieves the `GridModel` from the nearest `GridContext` provider.
 *
 * Intended as a backward-compatible convenience hook for consumers that
 * only need imperative access to the model (e.g. `model.sort(...)`,
 * `model.filter(...)`). Throws if called outside a `DataGrid` subtree.
 *
 * @typeParam TData - Row data shape.
 * @returns The `GridModel` instance for the enclosing grid.
 * @throws If no `GridContext` provider is found in the component tree.
 */
export function useGridContext<TData extends Record<string, unknown>>(): GridModel<TData> {
  // Look up the nearest GridContext value
  const ctx = useContext(GridContext);
  if (!ctx) throw new Error('useGridContext must be used within a DataGrid');
  return ctx.model as GridModel<TData>;
}

/**
 * Retrieves the full {@link GridContextValue} bundle -- model, atomic store,
 * and atom system -- from the nearest `GridContext` provider.
 *
 * Use this hook when you need fine-grained atom subscriptions (e.g. to
 * read or write individual grid atoms) rather than just the imperative model.
 * Throws if called outside a `DataGrid` subtree.
 *
 * @typeParam TData - Row data shape.
 * @returns The complete `GridContextValue` for the enclosing grid.
 * @throws If no `GridContext` provider is found in the component tree.
 */
export function useGridAtomContext<TData extends Record<string, unknown>>(): GridContextValue<TData> {
  // Look up the nearest GridContext value including store and atoms
  const ctx = useContext(GridContext);
  if (!ctx) throw new Error('useGridAtomContext must be used within a DataGrid');
  return ctx as unknown as GridContextValue<TData>;
}
