/**
 * Contract: grid-interaction-state lifted into causl.
 *
 * Pins the post-lift semantics:
 *   - useGridInteraction's `state` is read from a causl input node, not
 *     from useReducer. The pure reducer remains the transition function;
 *     only the storage / subscription substrate moves.
 *   - Each `dispatch(action)` produces exactly one causl commit with a
 *     descriptive intent label (`interaction:<action.type>`).
 *   - No-op transitions (reducer returns the same reference) do NOT
 *     produce a commit and do NOT re-render subscribers.
 *   - BYO-graph: when a graph is supplied via `useGridInteraction({ graph })`,
 *     interaction state lands on that graph under the documented
 *     `interaction:` namespace. External `graph.derived(...)` can read
 *     it atomically alongside grid data state. This is the same
 *     foundational reason invoked for `createGridModel`'s BYO-graph
 *     surface — interaction state belongs to the same graph as data
 *     state for SPA consumers that want a single source of truth.
 *   - Imperative helper identity (openContextMenu, closeMenu, …) is
 *     stable across re-renders, same as the pre-lift contract.
 *
 * Closes the long-standing PLAN_CAUSL_MIGRATION.md Phase 2 step 8 item.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { createCausl, type Commit } from '@iasbuilt/datagrid-core';
import { useGridInteraction } from '../../state/use-grid-interaction';

describe('useGridInteraction — causl substrate contract', () => {
  it('dispatch produces exactly one commit with intent label = `interaction:<action.type>`', () => {
    const graph = createCausl({ name: 'host' });
    const intents: string[] = [];
    graph.subscribeCommits((c) => intents.push(c.intent));

    const { result } = renderHook(() => useGridInteraction({ graph }));
    act(() => result.current.openContextMenu(100, 200, 'r1', 'name'));
    expect(intents).toEqual(['interaction:open-context-menu']);

    act(() => result.current.closeMenu());
    expect(intents).toEqual(['interaction:open-context-menu', 'interaction:close-menu']);
  });

  it('no-op dispatch (reducer returns the same state ref) does NOT commit', () => {
    const graph = createCausl({ name: 'host' });
    const commits: Commit[] = [];
    graph.subscribeCommits((c) => commits.push(c));

    const { result } = renderHook(() => useGridInteraction({ graph }));
    // closeMenu when already closed is a no-op (reducer returns prev state)
    act(() => result.current.closeMenu());
    expect(commits.length).toBe(0);
  });

  it('returns a stable state object that reflects subsequent dispatches', () => {
    const { result } = renderHook(() => useGridInteraction());
    expect(result.current.state.menu).toEqual({ type: 'closed' });
    act(() => result.current.openColumnMenu('email'));
    expect(result.current.state.menu).toEqual({ type: 'column', field: 'email' });
  });

  it('imperative helper functions are stable across re-renders', () => {
    const { result, rerender } = renderHook(() => useGridInteraction());
    const before = {
      openContextMenu: result.current.openContextMenu,
      closeMenu: result.current.closeMenu,
      startColumnDrag: result.current.startColumnDrag,
    };
    rerender();
    expect(result.current.openContextMenu).toBe(before.openContextMenu);
    expect(result.current.closeMenu).toBe(before.closeMenu);
    expect(result.current.startColumnDrag).toBe(before.startColumnDrag);
  });

  it('BYO-graph: external derived can compose interaction + caller state', () => {
    const graph = createCausl({ name: 'host' });
    const tabKey = graph.input<string>('app:tab', 'home');

    // External derivation that reads BOTH the host's tab AND the grid's
    // menu state from the shared graph. The hook below registers its
    // interaction node on the same graph, so this derived has visibility
    // into both worlds.
    const { result } = renderHook(() => useGridInteraction({ graph }));

    const summary = graph.derived('app:summary', (get) => {
      const tab = get(tabKey);
      // Look up interaction state by its documented node id.
      // (Mirror the SPA-integration playground pattern.)
      const interactionNode = { id: 'interaction:state' } as unknown as Parameters<typeof get>[0] & { _t: unknown };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = get(interactionNode as any) as { menu: { type: string } };
      return { tab, menuOpen: s.menu.type !== 'closed' };
    });

    expect(graph.read(summary)).toEqual({ tab: 'home', menuOpen: false });
    act(() => result.current.openColumnVisibilityMenu());
    expect(graph.read(summary)).toEqual({ tab: 'home', menuOpen: true });
  });

  it('private graph mode: when no graph is supplied, state still works (backcompat)', () => {
    const { result } = renderHook(() => useGridInteraction());
    expect(result.current.state.menu).toEqual({ type: 'closed' });
    act(() => result.current.openColumnVisibilityMenu());
    expect(result.current.state.menu).toEqual({ type: 'columnVisibility' });
  });

  it('two grids on the same graph have non-colliding interaction state via namespace', () => {
    const graph = createCausl({ name: 'host' });
    const a = renderHook(() => useGridInteraction({ graph, namespace: 'gridA' }));
    const b = renderHook(() => useGridInteraction({ graph, namespace: 'gridB' }));

    act(() => a.result.current.openColumnMenu('email'));
    expect(a.result.current.state.menu).toEqual({ type: 'column', field: 'email' });
    expect(b.result.current.state.menu).toEqual({ type: 'closed' });
  });
});
