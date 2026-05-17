/**
 * React hook for creating and memoizing a `GridModel` backed by causl.
 *
 * Post-Phase-3 shape: a thin React adapter over `createGridModel` from
 * `@iasbuilt/datagrid-core`. The core grid model now owns its own causl
 * graph (or accepts a caller-supplied one via `config.graph`), so the
 * React layer no longer needs the Jotai shadow-state machinery that
 * Phases 1–2 maintained alongside it.
 *
 * @module use-grid
 */
import { useMemo, useRef, useEffect } from 'react';
import {
  type GridConfig,
  type GridModel,
  createGridModel,
  createColumnState,
} from '@iasbuilt/datagrid-core';

/**
 * Creates and memoizes a {@link GridModel} for the lifetime of the
 * component. Stable across re-renders.
 *
 * `config.data` and `config.columns` are reactive: if the *reference*
 * changes between renders, an effect propagates the new value into the
 * model so subscribers re-render. Other config fields (rowKey,
 * selectionMode, etc.) are read once at construction.
 *
 * To compose grid state with other parts of your SPA (a pivot panel,
 * a chart, URL state), pass `config.graph` — a causl `Graph` instance
 * from `@causl/core`. External derivations registered against that
 * graph update atomically inside the same commit that produced the
 * grid mutation. See `playground/spa-integration/` for a worked example.
 *
 * @typeParam TData - Row data shape; must be a string-keyed record.
 * @param config - Grid configuration.
 * @returns The memoized {@link GridModel} instance.
 */
export function useGrid<TData extends Record<string, unknown>>(
  config: GridConfig<TData>
): GridModel<TData> {
  const configRef = useRef(config);
  configRef.current = config;

  const model = useMemo(() => createGridModel(config), []);

  const initialData = useRef(config.data);
  const initialColumns = useRef(config.columns);

  useEffect(() => {
    if (config.data !== initialData.current) {
      model.graph.commit('config:dataChange', (tx) => {
        tx.set(model.nodes.data, [...config.data]);
      });
    }
    initialData.current = config.data;
  }, [config.data, model]);

  useEffect(() => {
    if (config.columns !== initialColumns.current) {
      model.graph.commit('config:columnsChange', (tx) => {
        tx.set(model.nodes.columns, createColumnState(config.columns));
      });
    }
    initialColumns.current = config.columns;
  }, [config.columns, model]);

  return model;
}
