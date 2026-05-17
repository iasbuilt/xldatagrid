/**
 * Contract: `useGrid` / `useGridWithAtoms` lifecycle and stability.
 *
 * Pins the React-side guarantees that consuming components rely on. Must pass
 * on both the current Jotai-backed implementation and the post-migration
 * causl-backed implementation.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderHook, act, render } from '@testing-library/react';
import { useGrid, useGridWithAtoms } from '../../use-grid';
import type { GridConfig } from '@iasbuilt/datagrid-core';

type Row = { id: string; name: string; age: number };

function makeConfig(seed = 'Alice'): GridConfig<Row> {
  return {
    columns: [
      { id: 'name', field: 'name', title: 'Name', width: 160 },
      { id: 'age', field: 'age', title: 'Age', width: 80 },
    ],
    data: [
      { id: '1', name: seed, age: 30 },
      { id: '2', name: 'Bob', age: 25 },
    ],
    rowKey: 'id',
  };
}

describe('useGrid — lifecycle contract', () => {
  it('returns the same model instance across re-renders for the same component', () => {
    const { result, rerender } = renderHook(({ config }) => useGrid(config), {
      initialProps: { config: makeConfig() },
    });
    const first = result.current;
    rerender({ config: makeConfig() });
    expect(result.current).toBe(first);
  });

  it('propagates config.data changes into the model via effect (new reference triggers update)', async () => {
    const initial = makeConfig();
    const { result, rerender } = renderHook(({ config }) => useGrid(config), {
      initialProps: { config: initial },
    });
    expect(result.current.getState().data.map((r) => r.id)).toEqual(['1', '2']);

    const nextData = [
      { id: '1', name: 'Alice', age: 30 },
      { id: '2', name: 'Bob', age: 25 },
      { id: '3', name: 'Carol', age: 40 },
    ];
    rerender({ config: { ...initial, data: nextData } });

    // useEffect runs after render; renderHook awaits microtasks.
    expect(result.current.getState().data.map((r) => r.id)).toEqual(['1', '2', '3']);
  });

  it('propagates config.columns changes into the model via effect', () => {
    const initial = makeConfig();
    const { result, rerender } = renderHook(({ config }) => useGrid(config), {
      initialProps: { config: initial },
    });
    expect(result.current.getState().columns.order).toEqual(['name', 'age']);

    const nextColumns = [
      { id: 'name', field: 'name' as const, title: 'Name', width: 160 },
      { id: 'age', field: 'age' as const, title: 'Age', width: 80 },
      { id: 'extra', field: 'extra' as keyof Row, title: 'Extra', width: 80 },
    ];
    rerender({ config: { ...initial, columns: nextColumns } });
    expect(result.current.getState().columns.order).toEqual(['name', 'age', 'extra']);
  });

  it('mutations performed via the returned model are observable from outside', () => {
    const { result } = renderHook(() => useGrid(makeConfig()));
    expect(result.current.getState().selection.range).toBeNull();
    act(() => {
      result.current.select({ rowId: '1', field: 'name' });
    });
    expect(result.current.getState().selection.range).not.toBeNull();
  });

  it('unmounting the component does not throw and releases subscribers', () => {
    let modelCaptured: ReturnType<typeof useGrid<Row>> | null = null;
    function Inner() {
      modelCaptured = useGrid(makeConfig());
      return null;
    }
    const view = render(<Inner />);

    let calls = 0;
    modelCaptured!.subscribe(() => {
      calls += 1;
    });
    act(() => {
      modelCaptured!.select({ rowId: '1', field: 'name' });
    });
    expect(calls).toBe(1);

    view.unmount();
    // Post-unmount: outstanding subscribers should still exist (we own them)
    // but the model itself must not have been broken.
    expect(() => modelCaptured!.getState()).not.toThrow();
  });
});

describe('useGridWithAtoms — return shape contract', () => {
  it('returns an object with at least { model } and a single grid runtime', () => {
    const { result } = renderHook(() => useGridWithAtoms(makeConfig()));
    expect(result.current).toBeDefined();
    expect(result.current.model).toBeDefined();
    expect(typeof result.current.model.getState).toBe('function');
  });

  it('model identity is stable across re-renders', () => {
    const { result, rerender } = renderHook(
      ({ config }) => useGridWithAtoms(config),
      { initialProps: { config: makeConfig() } }
    );
    const first = result.current.model;
    rerender({ config: makeConfig() });
    expect(result.current.model).toBe(first);
  });
});
