/**
 * React hooks for creating and memoizing a Jotai-backed datagrid model.
 *
 * Provides two entry points: {@link useGrid} for consumers that only need the
 * imperative {@link GridModel} interface, and {@link useGridWithAtoms} for
 * those that also want direct access to the Jotai store and atom system for
 * granular reactive subscriptions.
 *
 * Both hooks guarantee that the grid runtime is created exactly once per
 * component lifetime (stable across re-renders) while keeping the latest
 * config accessible through a ref for any imperative callbacks that need it.
 *
 * @module use-grid
 */
import { useMemo, useRef, useEffect } from 'react';
import type { GridConfig, GridModel } from '@iasbuilt/datagrid-core';
import { createColumnState } from '@iasbuilt/datagrid-core';
import { createAtomicGridModel, type AtomicGridBundle, type AtomicStore } from './atomic-grid-model';
import type { GridAtomSystem } from './atoms';

/**
 * Return type of {@link useGridWithAtoms}, exposing all three layers of the
 * atomic grid bundle to the consuming component.
 *
 * @typeParam TData - Row data shape; must be a string-keyed record.
 */
export interface UseGridResult<TData extends Record<string, unknown>> {
  /** Imperative grid model facade. */
  model: GridModel<TData>;
  /** Raw Jotai store for direct atom reads/writes. */
  store: AtomicStore;
  /** Full atom system for granular React subscriptions. */
  atoms: GridAtomSystem<TData>;
}

/**
 * Creates and memoizes a {@link GridModel} backed by Jotai atoms.
 *
 * The model is constructed once on initial render using
 * {@link createAtomicGridModel} and is stable for the lifetime of the
 * component. A ref keeps the latest `config` available for any imperative
 * callbacks that may read it between renders.
 *
 * @typeParam TData - Row data shape; must be a string-keyed record.
 *
 * @param config - Grid configuration (columns, data, rowKey, etc.).
 *
 * @returns The imperative {@link GridModel} instance.
 *
 * @example
 * ```tsx
 * const model = useGrid<MyRow>({ columns, data, rowKey: 'id' });
 * ```
 */
export function useGrid<TData extends Record<string, unknown>>(
  config: GridConfig<TData>
): GridModel<TData> {
  const configRef = useRef(config);
  configRef.current = config;

  const bundle = useMemo(() => createAtomicGridModel(config), []);

  const initialData = useRef(config.data);
  const initialColumns = useRef(config.columns);

  useEffect(() => {
    if (config.data !== initialData.current) {
      bundle.store.set(bundle.atoms.base.dataAtom, [...config.data]);
    }
    initialData.current = config.data;
  }, [config.data, bundle]);

  useEffect(() => {
    if (config.columns !== initialColumns.current) {
      bundle.store.set(bundle.atoms.base.columnsAtom, createColumnState(config.columns));
    }
    initialColumns.current = config.columns;
  }, [config.columns, bundle]);

  return bundle.model;
}

/**
 * Creates and memoizes a {@link GridModel} along with the underlying Jotai
 * store and atom system.
 *
 * Behaves identically to {@link useGrid} but additionally returns the
 * `store` and `atoms` references, enabling components to subscribe to
 * individual atoms for fine-grained re-render control.
 *
 * @typeParam TData - Row data shape; must be a string-keyed record.
 *
 * @param config - Grid configuration (columns, data, rowKey, etc.).
 *
 * @returns A {@link UseGridResult} containing the model, store, and atoms.
 *
 * @example
 * ```tsx
 * const { model, store, atoms } = useGridWithAtoms<MyRow>({ columns, data, rowKey: 'id' });
 * // Subscribe to a single atom for granular updates
 * const sortState = useAtom(atoms.base.sortAtom, { store });
 * ```
 */
export function useGridWithAtoms<TData extends Record<string, unknown>>(
  config: GridConfig<TData>
): UseGridResult<TData> {
  // Keep a ref to the latest config so imperative callbacks can access
  // up-to-date values without recreating the model.
  const configRef = useRef(config);
  configRef.current = config;

  const result = useMemo(() => {
    const bundle = createAtomicGridModel(config);
    return { model: bundle.model, store: bundle.store, atoms: bundle.atoms };
  }, []);

  const initialData = useRef(config.data);
  const initialColumns = useRef(config.columns);

  useEffect(() => {
    if (config.data !== initialData.current) {
      result.store.set(result.atoms.base.dataAtom, [...config.data]);
    }
    initialData.current = config.data;
  }, [config.data, result]);

  useEffect(() => {
    if (config.columns !== initialColumns.current) {
      result.store.set(result.atoms.base.columnsAtom, createColumnState(config.columns));
    }
    initialColumns.current = config.columns;
  }, [config.columns, result]);

  return result;
}
