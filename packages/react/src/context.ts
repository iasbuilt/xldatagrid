/**
 * React context that carries the grid's `GridModel` to descendants.
 *
 * Post-Phase-3 shape: the context value contains only `model`. The
 * pre-Phase-3 `store` (Jotai vanilla store) and `atoms` (3-tier atom
 * system) are gone — `model.graph` and `model.nodes` (causl) cover the
 * same fine-grained subscription use cases.
 *
 * @module context
 */
import { createContext, useContext } from 'react';
import type { GridModel } from '@iasbuilt/datagrid-core';

/**
 * Shape of the value carried by {@link GridContext}.
 *
 * @typeParam TData - Row data shape; defaults to a generic record.
 */
export interface GridContextValue<TData = Record<string, unknown>> {
  /** Core imperative grid model from `@iasbuilt/datagrid-core`. */
  model: GridModel<TData>;
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
 * @typeParam TData - Row data shape.
 * @returns The `GridModel` instance for the enclosing grid.
 * @throws If no `GridContext` provider is found in the component tree.
 */
export function useGridContext<TData extends Record<string, unknown>>(): GridModel<TData> {
  const ctx = useContext(GridContext);
  if (!ctx) throw new Error('useGridContext must be used within a DataGrid');
  return ctx.model as GridModel<TData>;
}

/**
 * Backward-compatible alias for {@link useGridContext}. The pre-Phase-3
 * version returned a `{ model, store, atoms }` bundle; the latter two
 * fields no longer exist. New code should use {@link useGridContext}.
 *
 * @deprecated Use {@link useGridContext}.
 */
export function useGridAtomContext<TData extends Record<string, unknown>>(): GridContextValue<TData> {
  const ctx = useContext(GridContext);
  if (!ctx) throw new Error('useGridAtomContext must be used within a DataGrid');
  return ctx as unknown as GridContextValue<TData>;
}
