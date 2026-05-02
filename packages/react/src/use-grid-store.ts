/**
 * React hooks for subscribing to {@link GridModel} state changes.
 *
 * These hooks bridge the imperative {@link GridModel.subscribe} notification
 * channel into React's rendering cycle using `useSyncExternalStore` for
 * tear-free reads in concurrent React.
 *
 * {@link useGridStore} returns the complete {@link GridModelState} snapshot,
 * while {@link useGridSelector} accepts a selector function for deriving a
 * focused slice of state, reducing the surface area a component depends on.
 *
 * @module use-grid-store
 */
import { useSyncExternalStore, useCallback, useRef } from 'react';
import { GridModel, GridModelState } from '@iasbuilt/datagrid-core';

/**
 * Subscribes to a {@link GridModel} and returns the full state snapshot on
 * every change.
 *
 * @typeParam TData - Row data shape; must be a string-keyed record.
 * @param model - The {@link GridModel} instance to observe.
 * @returns The current {@link GridModelState} snapshot.
 */
export function useGridStore<TData extends Record<string, unknown>>(
  model: GridModel<TData>
): GridModelState<TData> {
  const cachedState = useRef(model.getState());

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      return model.subscribe(() => {
        cachedState.current = model.getState();
        onStoreChange();
      });
    },
    [model],
  );

  const getSnapshot = useCallback(() => cachedState.current, []);

  return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * Subscribes to a {@link GridModel} and returns a derived value computed by
 * the provided selector function.
 *
 * @typeParam TData - Row data shape; must be a string-keyed record.
 * @typeParam T - The derived value type returned by the selector.
 * @param model - The {@link GridModel} instance to observe.
 * @param selector - A pure function that extracts a value from the full
 *   {@link GridModelState}.
 * @returns The value produced by `selector` for the current state.
 */
export function useGridSelector<TData extends Record<string, unknown>, T>(
  model: GridModel<TData>,
  selector: (state: GridModelState<TData>) => T,
): T {
  const cachedValue = useRef(selector(model.getState()));

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      return model.subscribe(() => {
        cachedValue.current = selector(model.getState());
        onStoreChange();
      });
    },
    [model, selector],
  );

  const getSnapshot = useCallback(() => cachedValue.current, []);

  return useSyncExternalStore(subscribe, getSnapshot);
}
